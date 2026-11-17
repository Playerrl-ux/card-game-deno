import { describe, expect, test } from "vitest";
import { RoomManger } from "../room.manager.ts";
import { vi } from "vitest";

vi.mock("../../db/replay.repository.ts", () => {
  return {
    ReplayRepository: class {
      getOrCreateRoom = vi.fn();
      createMatch = vi.fn();
      recordEvent = vi.fn();
      finishMatch = vi.fn();
    },
  };
});

function createMockWebSocket() {
  const sentMessages: string[] = [];
  return {
    send: (msg: string) => sentMessages.push(msg),
    sentMessages,
  } as unknown as WebSocket & { sentMessages: string[] };
}

describe("Lobby Management (addBot, leaveRoom, getRoomState, joinRoom)", () => {
  test("addBot deve adicionar bots apenas se houver espaço e jogo não começou", () => {
    const roomManager = new RoomManger();
    const mockWs = createMockWebSocket();

    roomManager.createRoom("lobby1", mockWs);
    const room = roomManager.rooms.get("lobby1")!;

    expect(room.players.length).toBe(1);

    // Adicionando 3 bots
    roomManager.addBot("lobby1", mockWs);
    roomManager.addBot("lobby1", mockWs);
    roomManager.addBot("lobby1", mockWs);

    expect(room.players.length).toBe(4);
    expect(room.players[1].network.isBot).toBe(true);

    // Tentar adicionar o 5º player (bot) deve falhar (capacidade máxima)
    const errorWs = createMockWebSocket();
    roomManager.addBot("lobby1", errorWs);
    expect(room.players.length).toBe(4); // Não adicionou
    expect(errorWs.sentMessages.length).toBeGreaterThan(0);
    expect(errorWs.sentMessages[0]).toContain("ROOM_ERROR");
  });

  test("joinRoom deve substituir um Bot por um Humano caso a sala esteja cheia", () => {
    const roomManager = new RoomManger();
    const creatorWs = createMockWebSocket();
    roomManager.createRoom("lobby2", creatorWs);
    const room = roomManager.rooms.get("lobby2")!;

    // Enche a sala com bots
    roomManager.addBot("lobby2", creatorWs);
    roomManager.addBot("lobby2", creatorWs);
    roomManager.addBot("lobby2", creatorWs);

    expect(room.players.length).toBe(4);
    expect(room.players[1].network.isBot).toBe(true);

    // Novo Humano tenta entrar
    const humanWs = createMockWebSocket();
    roomManager.joinRoom("lobby2", humanWs);

    // A sala continua com 4 jogadores
    expect(room.players.length).toBe(4);

    // Mas o jogador 1 (que era bot) agora é humano (isBot = false)
    expect(room.players[1].network.isBot).toBe(false);
    expect(room.players[1].network.ws).toBe(humanWs);
    expect(roomManager.socketToRoom.get(humanWs)).toBe("lobby2");

    // Tentar adicionar um quinto Humano quando todos já são humanos (na verdade são 1 creator, 1 novo humano, e 2 bots)
    // vamos ver o que acontece substituindo os outros 2
    roomManager.joinRoom("lobby2", createMockWebSocket());
    roomManager.joinRoom("lobby2", createMockWebSocket());

    // Todos são humanos agora
    expect(room.players.filter((p) => p.network.isBot).length).toBe(0);

    // Mais um Humano deve tomar erro
    const rejectedWs = createMockWebSocket();
    roomManager.joinRoom("lobby2", rejectedWs);
    expect(room.players.length).toBe(4);
    expect(rejectedWs.sentMessages[0]).toContain("ROOM_ERROR");
  });

  test("leaveRoom deve remover o jogador e deletar a sala se ficar vazia", () => {
    const roomManager = new RoomManger();
    const ws1 = createMockWebSocket();
    const ws2 = createMockWebSocket();

    roomManager.createRoom("lobby3", ws1);
    roomManager.joinRoom("lobby3", ws2);

    expect(roomManager.rooms.has("lobby3")).toBe(true);
    const room = roomManager.rooms.get("lobby3")!;
    expect(room.players.length).toBe(2);

    // Player 2 sai
    roomManager.leaveRoom("lobby3", ws2);
    expect(room.players.length).toBe(1);
    expect(roomManager.socketToRoom.has(ws2)).toBe(false);

    // Player 1 (criador) sai
    roomManager.leaveRoom("lobby3", ws1);
    // Sala deve ser deletada
    expect(roomManager.rooms.has("lobby3")).toBe(false);
  });

  test("getRoomState deve enviar o estado correto da sala para o socket requisitante", () => {
    const roomManager = new RoomManger();
    const ws1 = createMockWebSocket();

    roomManager.createRoom("lobby4", ws1);
    roomManager.addBot("lobby4", ws1);

    const room = roomManager.rooms.get("lobby4")!;
    const player1 = room.players[0];

    // Simula a chegada do comando getRoomState
    roomManager.getRoomState("lobby4", player1.id, ws1);

    const sentMessages = (ws1 as any).sentMessages;
    // Pega a última mensagem enviada (a do ROOM_STATE, já que houve ROOM_CREATED e ROOM_JOINED antes)
    const stateMessageStr = sentMessages[sentMessages.length - 1];

    const stateMessage = JSON.parse(stateMessageStr);
    expect(stateMessage.type).toBe("EXTERNAL");
    expect(stateMessage.name).toBe("ROOM_STATE");

    const stateData = stateMessage.data;
    expect(stateData.roomName).toBe("lobby4");
    expect(stateData.players.length).toBe(2);
    expect(stateData.players[0].isBot).toBe(false);
    expect(stateData.players[1].isBot).toBe(true);
  });
});

describe("Game Lifecycle (finishGame)", () => {
  test("finishGame deve deletar a sala se restarem apenas bots", async () => {
    const roomManager = new RoomManger();
    const mockWs = createMockWebSocket();

    await roomManager.createRoom("gameRoom1", mockWs);
    const room = roomManager.rooms.get("gameRoom1")!;

    // Simula o começo do jogo
    room.activeMatchId = "match-123";

    // O humano cai e vira bot
    room.players[0].network.isBot = true;

    // Chama finishGame
    await roomManager.finishGame("gameRoom1");

    // A sala não deve mais existir
    expect(roomManager.rooms.has("gameRoom1")).toBe(false);
  });

  test("finishGame deve manter a sala se ainda existir pelo menos um humano", async () => {
    const roomManager = new RoomManger();
    const mockWs = createMockWebSocket();

    await roomManager.createRoom("gameRoom2", mockWs);
    const room = roomManager.rooms.get("gameRoom2")!;
    roomManager.addBot("gameRoom2", mockWs);

    room.activeMatchId = "match-456";

    // Chama finishGame (o player 1 ainda é humano)
    await roomManager.finishGame("gameRoom2");

    // A sala DEVE continuar existindo
    expect(roomManager.rooms.has("gameRoom2")).toBe(true);

    // Os dados da partida devem ter sido limpos
    expect(room.activeMatchId).toBeUndefined();
    expect(room.modeIniter).toBeUndefined();
    expect(room.eventGuard).toBeUndefined();
  });

  test("startGame deve repassar a seed informada para createMatch", async () => {
    const roomManager = new RoomManger();
    const mockWs = createMockWebSocket();
    const mockWs2 = createMockWebSocket();

    await roomManager.createRoom("seedRoom1", mockWs);
    roomManager.joinRoom("seedRoom1", mockWs2);

    const defaultConfigs = {
      SEVEN_HAS_EFFECT: true,
      ZERO_HAS_EFFECT: true,
      DRAW_2_OVER_DRAW_4: true,
      DRAW_UNTIL_HAVE: true,
      JUMPIN: true,
      DRAW_4_CHALLENGES: true,
    };

    await roomManager.startGame(
      "seedRoom1",
      "Default",
      mockWs,
      defaultConfigs,
      1,
      99999,
    );

    const createMatchMock = (roomManager.replayRepository as any).createMatch;
    expect(createMatchMock).toHaveBeenCalled();
    const lastCall =
      createMatchMock.mock.calls[createMatchMock.mock.calls.length - 1];
    expect(lastCall[1]).toBe("seedRoom1");
    expect(lastCall[2]).toBe("Default");
    expect(lastCall[3]).toBe(99999);
  });

  test("startGame sem seed deve gerar uma seed numérica e repassar para createMatch", async () => {
    const roomManager = new RoomManger();
    const mockWs = createMockWebSocket();
    const mockWs2 = createMockWebSocket();

    await roomManager.createRoom("seedRoom2", mockWs);
    roomManager.joinRoom("seedRoom2", mockWs2);

    const defaultConfigs = {
      SEVEN_HAS_EFFECT: true,
      ZERO_HAS_EFFECT: true,
      DRAW_2_OVER_DRAW_4: true,
      DRAW_UNTIL_HAVE: true,
      JUMPIN: true,
      DRAW_4_CHALLENGES: true,
    };

    await roomManager.startGame("seedRoom2", "Default", mockWs, defaultConfigs, 1);

    const createMatchMock = (roomManager.replayRepository as any).createMatch;
    expect(createMatchMock).toHaveBeenCalled();
    const lastCall =
      createMatchMock.mock.calls[createMatchMock.mock.calls.length - 1];
    expect(lastCall[1]).toBe("seedRoom2");
    expect(lastCall[2]).toBe("Default");
    expect(typeof lastCall[3]).toBe("number");
    expect(lastCall[3]).toBeGreaterThan(0);
  });
});
