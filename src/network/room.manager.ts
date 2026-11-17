import { ReplayRepository } from "../db/replay.repository.ts";
import { EventGuard } from "../game-logic/base/event.guard.ts";
import { ModeIniter, ModeTypes } from "../game-logic/base/mode.ts";
import { Player } from "../game-logic/base/player/player.state.ts";
import { NetworkEventHandler } from "./event-handler.network.ts";
import { ExternalClientEventPayloads } from "./external-payloads.ts";
import {
  PlayerStatusChangedEvent,
  PongEvent,
  RoomCreatedEvent,
  RoomErrorEvent,
  RoomJoinedEvent,
  RoomLeftEvent,
  RoomStateEvent,
} from "./external.event.ts";
import { modesMap } from "./modes-map.ts";
import {
  createRoomSchema,
  EventNetwork,
  gameEventSchema,
  startGameSchema,
} from "./network.event.ts";
import { PlayerSocketImpl } from "./player.socket.ts";

const MAX_PLAYERS = 4;

export interface Room {
  isTestRoom?: boolean;
  activeMatchId?: string;
  players: Player<PlayerSocketImpl>[];
  modeIniter: ModeIniter<ModeTypes> | undefined;
  eventGuard: EventGuard | undefined;
  wsMap: Map<WebSocket, Player<PlayerSocketImpl>>;
}

export class RoomManger {
  rooms: Map<string, Room> = new Map();
  socketToRoom: Map<WebSocket, string> = new Map();
  replayRepository: ReplayRepository;
  heartbeatInterval?: ReturnType<typeof setInterval>;

  constructor() {
    const worker = new Worker(
      new URL("../worker/store-worker.ts", import.meta.url).href,
      {
        type: "module",
      },
    );
    this.replayRepository = new ReplayRepository(worker);
  }
  /**
   * Envia uma mensagem de erro externa para o socket do cliente.
   */
  sendError(socket: WebSocket, message: string, roomName: string = "") {
    const tempPlayer: Player<PlayerSocketImpl> = {
      id: -1,
      hand: [],
      network: new PlayerSocketImpl(socket, false, roomName),
    };
    const errorEvent = new RoomErrorEvent(null, [tempPlayer], { message });
    tempPlayer.network.sendToPlayer(errorEvent);
  }

  async handle(event: EventNetwork, ws: WebSocket) {
    try {
      const eventName = event.name;

      if (
        eventName !== ExternalClientEventPayloads.CREATE_ROOM.commomName &&
        eventName !== ExternalClientEventPayloads.JOIN_ROOM.commomName &&
        eventName !== ExternalClientEventPayloads.RECONNECT_ROOM.commomName &&
        eventName !== ExternalClientEventPayloads.GET_ROOM_STATE.commomName
      ) {
        const boundRoom = this.socketToRoom.get(ws);
        if (boundRoom && boundRoom !== event.roomName) {
          this.sendError(
            ws,
            "You cannot interact with a room you are not in",
            event.roomName,
          );
          return;
        }
      }

      const room = this.rooms.get(event.roomName);
      if (room) {
        const player = room.wsMap.get(ws);
        if (player) {
          player.network.updateLastSeen();
        }
      }

      if (
        eventName.toLowerCase() === ExternalClientEventPayloads.PING.commomName
      ) {
        const roomObj = this.rooms.get(event.roomName);
        const p = roomObj?.wsMap.get(ws);
        if (p) {
          p.network.sendToPlayer(new PongEvent(p, [p]));
        }
        return;
      }

      if (room && room.activeMatchId) {
        this.replayRepository.recordEvent(
          room.activeMatchId,
          "CLIENT",
          event.sendedBy,
          event.type,
          eventName,
          event.data,
        );
      }

      if (event.type === "GAME") {
        const gameEvent = gameEventSchema.parse(event.data);
        this.handlePlay(event.roomName, eventName, gameEvent.data, ws);
        return;
      }
      switch (eventName) {
        case ExternalClientEventPayloads.CREATE_ROOM.commomName: {
          const parsed = createRoomSchema.safeParse(event.data);
          const isTestRoom = parsed.success ? parsed.data.isTestRoom : false;
          await this.createRoom(event.roomName, ws, isTestRoom);
          break;
        }

        case ExternalClientEventPayloads.JOIN_ROOM.commomName: {
          this.joinRoom(event.roomName, ws);
          break;
        }

        case ExternalClientEventPayloads.RECONNECT_ROOM.commomName: {
          this.reconnectRoom(event.roomName, event.sendedBy, ws);
          break;
        }

        case ExternalClientEventPayloads.ADD_BOT.commomName: {
          this.addBot(event.roomName, ws);
          break;
        }

        case ExternalClientEventPayloads.LEAVE_ROOM.commomName: {
          this.leaveRoom(event.roomName, ws);
          break;
        }

        case ExternalClientEventPayloads.GET_ROOM_STATE.commomName: {
          this.getRoomState(event.roomName, event.sendedBy, ws);
          break;
        }

        case ExternalClientEventPayloads.START_GAME.commomName: {
          const parsed = startGameSchema.parse(event.data);
          await this.startGame(
            event.roomName,
            parsed.modeName,
            ws,
            parsed.configs,
            parsed.numberOfDecks,
            parsed.seed ?? (parsed.configs as any)?.seed,
          );
          break;
        }

        default:
          break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      this.sendError(ws, message, event.roomName);
    }
  }

  handleDisconnect(socket: WebSocket, gracePeriodMs: number = 15000) {
    const roomName = this.socketToRoom.get(socket);
    if (!roomName) return;

    const room = this.rooms.get(roomName);
    if (!room) return;

    const player = room.wsMap.get(socket);
    if (!player) return;

    player.network.markDisconnected(gracePeriodMs, () => {
      console.log(
        `[RoomManager] Player ${player.id} in room ${roomName} exceeded grace period. Setting isBot = true`,
      );
      const statusEvent = new PlayerStatusChangedEvent(null, room.players, {
        playerId: player.id,
        isConnected: false,
        isBot: true,
      });
      room.players.forEach((p) => p.network.sendToPlayer(statusEvent));
    });

    const statusEvent = new PlayerStatusChangedEvent(null, room.players, {
      playerId: player.id,
      isConnected: false,
      isBot: player.network.isBot,
    });
    room.players.forEach((p) => p.network.sendToPlayer(statusEvent));
  }

  // Esse metodo pode ser modificado para melhorar a performance depois
  checkHeartbeats(timeoutMs: number = 30000, gracePeriodMs: number = 15000) {
    const now = Date.now();
    for (const [_, room] of this.rooms.entries()) {
      for (const player of room.players) {
        if (
          player.network.isConnected &&
          !player.network.isBot &&
          now - player.network.lastSeenAt > timeoutMs
        ) {
          console.log(
            `[RoomManager] Heartbeat timeout for player ${player.id}. Marking disconnected.`,
          );
          player.network.markDisconnected(gracePeriodMs, () => {
            const statusEvent = new PlayerStatusChangedEvent(
              null,
              room.players,
              {
                playerId: player.id,
                isConnected: false,
                isBot: true,
              },
            );
            room.players.forEach((p) => p.network.sendToPlayer(statusEvent));
          });

          const statusEvent = new PlayerStatusChangedEvent(null, room.players, {
            playerId: player.id,
            isConnected: false,
            isBot: false,
          });
          room.players.forEach((p) => p.network.sendToPlayer(statusEvent));
        }
      }
    }
  }

  startHeartbeatMonitor(
    intervalMs: number = 5000,
    timeoutMs: number = 30000,
    gracePeriodMs: number = 15000,
  ) {
    if (this.heartbeatInterval) return;
    this.heartbeatInterval = setInterval(
      () => this.checkHeartbeats(timeoutMs, gracePeriodMs),
      intervalMs,
    );
  }

  stopHeartbeatMonitor() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  async createRoom(
    roomName: string,
    socket: WebSocket,
    isTestRoom: boolean = false,
  ) {
    if (this.socketToRoom.has(socket)) {
      this.sendError(socket, "You are already in a room", roomName);
      return;
    }
    let room = this.rooms.get(roomName);
    if (room) {
      this.sendError(socket, "Room already exists", roomName);
      return;
    }

    const creatorPlayer: Player<PlayerSocketImpl> = {
      id: 0,
      hand: [],
      network: new PlayerSocketImpl(
        socket,
        isTestRoom ? true : false,
        roomName,
      ),
    };

    room = {
      players: [creatorPlayer],
      modeIniter: undefined,
      eventGuard: undefined,
      wsMap: new Map([[socket, creatorPlayer]]),
      isTestRoom,
    };

    this.rooms.set(roomName, room);
    this.socketToRoom.set(socket, roomName);
    await this.replayRepository.getOrCreateRoom(roomName);

    // Envia evento de confirmação de criação de sala para o criador
    const createdEvent = new RoomCreatedEvent(creatorPlayer, [creatorPlayer], {
      roomName,
      playerId: creatorPlayer.id,
    });
    creatorPlayer.network.sendToPlayer(createdEvent);

    return room;
  }

  joinRoom(roomName: string, socket: WebSocket) {
    if (this.socketToRoom.has(socket)) {
      this.sendError(socket, "You are already in a room", roomName);
      return;
    }
    const room = this.rooms.get(roomName);
    if (!room) {
      this.sendError(socket, "Room doesnt exist", roomName);
      return;
    }
    if (room.activeMatchId) {
      this.sendError(socket, "Game has already started", roomName);
      return;
    }
    if (room.wsMap.get(socket)) {
      this.sendError(socket, "You are already in this room", roomName);
      return;
    }

    if (room.players.length >= MAX_PLAYERS) {
      const botPlayer = room.players.find((p) => p.network.isBot);
      if (botPlayer) {
        botPlayer.network.isBot = false;
        botPlayer.network.ws = socket;
        this.socketToRoom.set(socket, roomName);
        room.wsMap.set(socket, botPlayer);

        const joinedEvent = new RoomJoinedEvent(botPlayer, room.players, {
          roomName,
          playerId: botPlayer.id,
          players: room.players.map((p) => ({ id: p.id, isBot: p.network.isBot })),
        });
        room.players.forEach((p) => p.network.sendToPlayer(joinedEvent));
        return room;
      } else {
        this.sendError(socket, "Room is full", roomName);
        return;
      }
    }

    // Atribui o menor ID numérico vago para evitar colisões
    const existingIds = new Set(room.players.map((p) => p.id));
    let nextId = 0;
    while (existingIds.has(nextId)) {
      nextId++;
    }

    const newPlayer: Player<PlayerSocketImpl> = {
      id: nextId,
      hand: [],
      network: new PlayerSocketImpl(
        socket,
        room.isTestRoom ? true : false,
        roomName,
      ),
    };

    room.players.push(newPlayer);
    room.wsMap.set(socket, newPlayer);
    this.socketToRoom.set(socket, roomName);

    // Notifica todos os jogadores na sala sobre o novo participante
    const joinedEvent = new RoomJoinedEvent(newPlayer, room.players, {
      roomName,
      playerId: newPlayer.id,
      players: room.players.map((p) => ({ id: p.id, isBot: p.network.isBot })),
    });
    room.players.forEach((p) => p.network.sendToPlayer(joinedEvent));

    return room;
  }

  addBot(roomName: string, socket: WebSocket) {
    const room = this.rooms.get(roomName);
    if (!room) {
      return this.sendError(socket, "Room doesnt exist", roomName);
    }
    if (room.activeMatchId) {
      return this.sendError(socket, "Game has already started", roomName);
    }

    if (room.players.length >= MAX_PLAYERS) {
      return this.sendError(socket, "Room is full", roomName);
    }

    // Atribui o menor ID numérico vago para o bot
    const existingIds = new Set(room.players.map((p) => p.id));
    let nextId = 0;
    while (existingIds.has(nextId)) {
      nextId++;
    }

    const newBot: Player<PlayerSocketImpl> = {
      id: nextId,
      hand: [],
      network: new PlayerSocketImpl(
        undefined as unknown as WebSocket,
        true,
        roomName,
      ),
    };

    room.players.push(newBot);

    const joinedEvent = new RoomJoinedEvent(newBot, room.players, {
      roomName,
      playerId: newBot.id,
      players: room.players.map((p) => ({ id: p.id, isBot: p.network.isBot })),
    });
    room.players.forEach((p) => p.network.sendToPlayer(joinedEvent));
  }

  leaveRoom(roomName: string, socket: WebSocket) {
    const room = this.rooms.get(roomName);
    if (!room) return;
    if (room.activeMatchId) return; // Cannot leaveRoom if active, must disconnect

    const playerIndex = room.players.findIndex((p) => p.network.ws === socket);
    if (playerIndex === -1) return;
    const player = room.players[playerIndex];

    this.socketToRoom.delete(socket);
    room.wsMap.delete(socket);
    room.players.splice(playerIndex, 1);

    if (room.players.length === 0) {
      this.rooms.delete(roomName);
      console.log(
        `[RoomManager] Room ${roomName} deleted because it became empty before game started.`,
      );
      return;
    }

    const leftEvent = new RoomLeftEvent(null, room.players, {
      roomName,
      playerId: player.id,
    });
    room.players.forEach((p) => p.network.sendToPlayer(leftEvent));
  }

  getRoomState(roomName: string, playerId: number, socket: WebSocket) {
    const room = this.rooms.get(roomName);
    if (!room) {
      return this.sendError(socket, "Room doesnt exist", roomName);
    }

    const requesterPlayer =
      room.wsMap.get(socket) ||
      room.players.find((p) => p.id === playerId && p.network.ws === socket) ||
      room.players.find((p) => p.id === playerId && !p.network.isBot) ||
      room.players.find((p) => p.id === playerId);

    if (!requesterPlayer) {
      return this.sendError(socket, "Player not found in room", roomName);
    }

    const stateEvent = new RoomStateEvent(null, [requesterPlayer], {
      roomName,
      players: room.players.map((p) => ({ id: p.id, isBot: p.network.isBot })),
    });

    requesterPlayer.network.sendToPlayer(stateEvent);
  }

  reconnectRoom(roomName: string, playerId: number, socket: WebSocket) {
    const room = this.rooms.get(roomName);
    if (!room) {
      return this.sendError(socket, "Room not found", roomName);
    }

    // We only allow reconnecting if the game has started (activeMatchId exists)
    // If the game hasn't started, the player could just join normally, but reconnecting is fine too.
    const player = room.players.find((p) => p.id === playerId);
    if (!player) {
      return this.sendError(socket, "Player not found in room", roomName);
    }

    const oldWs = player.network.ws as WebSocket;

    if (oldWs && oldWs !== socket) {
      this.socketToRoom.delete(oldWs);
      room.wsMap.delete(oldWs);
    }

    this.socketToRoom.set(socket, roomName);
    room.wsMap.set(socket, player);

    (player.network as PlayerSocketImpl).markReconnected(socket, () => {
      console.log(
        `[RoomManager] Player ${playerId} reconnected to room ${roomName}`,
      );

      const statusEvent = new PlayerStatusChangedEvent(null, room.players, {
        playerId: player.id,
        isConnected: true,
        isBot: false,
      });
      room.players.forEach((p) => p.network.sendToPlayer(statusEvent));

      if (room.eventGuard) {
        room.eventGuard.requestSnapshot(player);
      }
    });
  }

  async startGame(
    roomName: string,
    modeName: string,
    socket: WebSocket,
    configs: unknown,
    numberOfDecks: number,
    seed?: number,
  ) {
    const room = this.rooms.get(roomName);
    if (!room) {
      this.sendError(socket, "Room doesnt exist");
      return;
    }
    const senderPlayer = room.wsMap.get(socket);
    if (!senderPlayer) {
      this.sendError(socket, "You are not in this room");
      return;
    }
    if (room.players.length < 2) {
      this.sendError(socket, "Not enough players to play");
      return;
    }
    const modeIniter = modesMap.get(modeName);
    if (!modeIniter) {
      this.sendError(socket, "Game mode does not exist");
      return;
    }

    try {
      if (room.isTestRoom && typeof configs === "object" && configs !== null) {
        (configs as any).isTestRoom = true;
      }
      const parsedConfigs = modeIniter.configsSchema.parse(configs);
      const effectiveSeed = seed ?? (parsedConfigs as any)?.seed;

      const modeInited = modeIniter.init(
        room.players,
        parsedConfigs,
        numberOfDecks,
        new NetworkEventHandler(),
        (winnerId: number) => {
          console.log(
            `[RoomManager] Player ${winnerId} won the game in room ${roomName}`,
          );
          this.finishGame(roomName);
        },
        effectiveSeed,
      );

      const activeSeed =
        (modeInited.eventGuard as any)?.state?.initialSeed ??
        (modeInited.eventManager as any)?.state?.initialSeed ??
        effectiveSeed ??
        (modeInited.eventGuard as any)?.state?.seed ??
        null;

      const matchId = crypto.randomUUID();
      room.activeMatchId = matchId;
      await this.replayRepository.createMatch(
        matchId,
        roomName,
        modeName,
        activeSeed,
      );

      room.players.forEach((p) => {
        p.network = new PlayerSocketImpl(
          (p.network as PlayerSocketImpl).ws,
          p.network.isBot,
          roomName,
          matchId,
          this.replayRepository,
          (event) => modeInited.eventGuard.manageBotAction(p.id, event),
        );
      });

      room.modeIniter = modeIniter;
      room.eventGuard = modeInited.eventGuard;

      // Inicia a partida: distribui mãos, emite GameStartedEvent (com wholeDeck e carta inicial do descarte) e define o 1º turno com permissões
      modeInited.eventGuard.eventManager.initGame(roomName, modeName);

      return room;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start game";
      this.sendError(socket, message);
    }
  }

  async finishGame(roomName: string) {
    const room = this.rooms.get(roomName);
    if (!room) {
      return;
    }
    if (room.activeMatchId) {
      await this.replayRepository.finishMatch(room.activeMatchId, "FINISHED");
      room.activeMatchId = undefined;
    }
    if (room.eventGuard) {
      room.eventGuard.eventManager.cancelAllWaiters();
    }
    room.modeIniter = undefined;
    room.eventGuard = undefined;

    const hasHuman = room.players.some((p) => !p.network.isBot);
    if (!hasHuman) {
      this.rooms.delete(roomName);
      console.log(
        `[RoomManager] Room ${roomName} deleted because no human players remain after the game finished.`,
      );
    }
  }

  handlePlay(
    roomName: string,
    eventName: string,
    data: unknown,
    ws: WebSocket,
  ) {
    const room = this.rooms.get(roomName);
    if (!room) {
      this.sendError(ws, "Room doesnt exist", roomName);
      return;
    }
    const player = room.wsMap.get(ws);
    if (!player) {
      this.sendError(ws, "You are not in this room", roomName);
      return;
    }
    if (!room.eventGuard) {
      this.sendError(ws, "Game didnt start", roomName);
      return;
    }
    try {
      room.eventGuard.guard(player, eventName, data);
    } catch (_err) {
      // O guard já emitiu o RoomErrorEvent ao jogador via eventManager e lançou o erro para abortar a execução.
    }
  }
}
