import { describe, expect, test, vi } from "vitest";
import { RoomManger } from "../room.manager.ts";
import { PlayerSocketImpl } from "../player.socket.ts";

vi.mock("../../db/replay.repository.ts", () => {
  return {
    ReplayRepository: class {
      getOrCreateRoom = vi.fn();
      recordEvent = vi.fn();
      finishMatch = vi.fn();
    }
  };
});

function createMockWebSocket() {
  const sentMessages: string[] = [];
  return {
    send: (msg: string) => sentMessages.push(msg),
    sentMessages,
  } as unknown as WebSocket;
}

describe("Heartbeat and Disconnection to Bot Manager", () => {
  test("deve marcar o jogador como desconectado imediatamente no socket disconnect e virar BOT após grace period", async () => {
    vi.useFakeTimers();

    const roomManager = new RoomManger();
    const mockWs = createMockWebSocket();

    roomManager.createRoom("room10", mockWs);
    const room = roomManager.rooms.get("room10")!;
    const player = room.players[0];

    expect(player.network.isConnected).toBe(true);
    expect(player.network.isBot).toBe(false);

    // Simula queda de conexão
    roomManager.handleDisconnect(mockWs, 5000);

    expect(player.network.isConnected).toBe(false);
    expect(player.network.isBot).toBe(false);

    // Avança o tempo até expirar o grace period (5000ms)
    vi.advanceTimersByTime(5000);

    expect(player.network.isBot).toBe(true);

    vi.useRealTimers();
  });

  test("deve responder ao PING com PONG e atualizar lastSeenAt", () => {
    const roomManager = new RoomManger();
    const mockWs = createMockWebSocket();

    roomManager.createRoom("room10", mockWs);
    const room = roomManager.rooms.get("room10")!;
    const player = room.players[0];

    const initialLastSeen = player.network.lastSeenAt;

    // Envia evento de PING
    roomManager.handle(
      {
        type: "EXTERNAL",
        name: "PING",
        sendedBy: 0,
        roomName: "room10",
        data: {},
      },
      mockWs,
    );

    expect(player.network.lastSeenAt).toBeGreaterThanOrEqual(initialLastSeen);
    const mockWsTyped = mockWs as any;
    expect(mockWsTyped.sentMessages.length).toBeGreaterThan(0);
    const lastSent = JSON.parse(mockWsTyped.sentMessages[mockWsTyped.sentMessages.length - 1]);
    expect(lastSent.name).toBe("PONG");
  });

  test("checkHeartbeats deve detectar inatividade e agendar transição para BOT", () => {
    vi.useFakeTimers();

    const roomManager = new RoomManger();
    const mockWs = createMockWebSocket();

    roomManager.createRoom("room10", mockWs);
    const room = roomManager.rooms.get("room10")!;
    const player = room.players[0];

    // Força lastSeenAt antigo (40s atrás)
    player.network.lastSeenAt = Date.now() - 40000;

    roomManager.checkHeartbeats(30000, 10000);

    expect(player.network.isConnected).toBe(false);
    expect(player.network.isBot).toBe(false);

    vi.advanceTimersByTime(10000);

    expect(player.network.isBot).toBe(true);

    vi.useRealTimers();
  });

  test("deve impedir um mesmo socket de estar em mais de uma sala ao mesmo tempo", () => {
    const roomManager = new RoomManger();
    const mockWs = createMockWebSocket();

    roomManager.createRoom("room10", mockWs);
    expect(roomManager.socketToRoom.get(mockWs)).toBe("room10");

    // Tenta criar outra sala com o mesmo socket
    roomManager.createRoom("room20", mockWs);
    const mockWsTyped = mockWs as any;
    const lastSent = JSON.parse(mockWsTyped.sentMessages[mockWsTyped.sentMessages.length - 1]);
    expect(lastSent.name).toBe("ROOM_ERROR");
    expect(lastSent.data.message).toBe("You are already in a room");
  });
});
