import { PlayerSocket } from "../game-logic/base/player/player.state.ts";
import { ServerEventArgs } from "../game-logic/base/server.event.ts";
import { EventNetwork } from "./network.event.ts";
import { ReplayRepository } from "../db/replay.repository.ts";

// essa classe vai ser usada quando o player se desconectar e um bot tiver que assumir
export class PlayerSocketImpl implements PlayerSocket<WebSocket> {
  ws?: WebSocket;
  isConnected: boolean;
  isBot: boolean;
  onBotServerEvent?: (event: ServerEventArgs<unknown>) => void;
  roomName: string;
  matchId?: string;
  replayRepository?: ReplayRepository;
  lastEvent?: ServerEventArgs<unknown> | { name: string; data: unknown; sendedBy?: number };
  lastClientEventName?: string | null;
  lastSeenAt: number;
  disconnectTimeout?: ReturnType<typeof setTimeout>;

  constructor(
    ws: WebSocket,
    isBot: boolean,
    roomName: string = "",
    matchId?: string,
    replayRepository?: ReplayRepository,
    onBotServerEvent?: (event: ServerEventArgs<unknown>) => void,
  ) {
    this.ws = ws;
    this.isBot = isBot;
    this.roomName = roomName;
    this.matchId = matchId;
    this.replayRepository = replayRepository;
    this.onBotServerEvent = onBotServerEvent;
    this.isConnected = true;
    this.lastSeenAt = Date.now();
  }

  updateLastSeen() {
    this.lastSeenAt = Date.now();
    this.isConnected = true;
  }

  markDisconnected(gracePeriodMs: number = 15000, onBotAssumed?: () => void) {
    this.isConnected = false;
    if (!this.isBot && !this.disconnectTimeout) {
      this.disconnectTimeout = setTimeout(() => {
        this.isBot = true;
        this.disconnectTimeout = undefined;
        onBotAssumed?.();
      }, gracePeriodMs);
    }
  }

  markReconnected(ws: WebSocket, onReconnected?: () => void) {
    if (this.disconnectTimeout) {
      clearTimeout(this.disconnectTimeout);
      this.disconnectTimeout = undefined;
    }
    this.ws = ws;
    this.isConnected = true;
    this.isBot = false;
    this.lastSeenAt = Date.now();
    onReconnected?.();
  }

  // esse metodo vai ser usado para enviar algum evento para o player
  sendToPlayer(event: ServerEventArgs<unknown>) {
    this.lastEvent = {
      name: event.name,
      data: event.data,
      sendedBy: event.sendedBy?.id ?? -1,
    };
    const networkEvent: EventNetwork = {
      type: event.isExternal ? "EXTERNAL" : "GAME",
      name: event.name,
      roomName: this.roomName,
      data: event.data,
      sendedBy: event.sendedBy?.id ?? -1,
    };

    if (this.matchId && this.replayRepository) {
      this.replayRepository.recordEvent(
        this.matchId,
        "SERVER",
        event.sendedBy?.id ?? -1,
        networkEvent.type,
        event.name,
        event.data,
      );
    }

    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify(networkEvent));
    }

    if (this.isBot && this.onBotServerEvent) {
      this.onBotServerEvent(event);
    }
  }
}
