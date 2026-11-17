import { describe, expect, it } from "vitest";
import { getDatabase } from "../sqlite.connection.ts";
import { ReplayRepository } from "../replay.repository.ts";

function createTestWorker() {
  const db = getDatabase(":memory:");
  let messageHandler: ((e: MessageEvent) => void) | null = null;

  return {
    set onmessage(fn: (e: MessageEvent) => void) {
      messageHandler = fn;
    },
    get onmessage() {
      return messageHandler;
    },
    postMessage(msg: any) {
      queueMicrotask(() => {
        try {
          const { name, promiseId, data } = msg;

          if (name === "MAIN_STATEMENT") {
            return;
          }

          const params = Array.isArray(data?.args) ? data.args : [data?.args];

          if (name === "DATABASE_READ") {
            const stmt = db.prepare(data.sql);
            const result =
              data.method === "get"
                ? stmt.get(...params)
                : stmt.all(...params);

            if (promiseId !== undefined && messageHandler) {
              messageHandler({
                data: { promiseId, data: result },
              } as MessageEvent);
            }
          } else if (name === "DATABASE_WRITE") {
            db.prepare(data.sql).run(...params);
            if (promiseId !== undefined && messageHandler) {
              messageHandler({
                data: { promiseId, data: { success: true } },
              } as MessageEvent);
            }
          } else if (name === "FINISH_GAME") {
            if (promiseId !== undefined && messageHandler) {
              messageHandler({
                data: { promiseId, data: { success: true } },
              } as MessageEvent);
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (msg.promiseId !== undefined && messageHandler) {
            messageHandler({
              data: { promiseId: msg.promiseId, error: message },
            } as MessageEvent);
          }
        }
      });
    },
  } as unknown as Worker;
}

describe("ReplayRepository (Assíncrono via Worker)", () => {
  it("deve criar uma sala na tabela rooms e vincular partidas a ela", async () => {
    const worker = createTestWorker();
    const repo = new ReplayRepository(worker);

    const roomName = "room-alpha";
    const room = await repo.getOrCreateRoom(roomName);

    expect(room.id).toBeDefined();
    expect(room.name).toBe(roomName);

    const matchId = "match-test-123";
    const modeName = "uno-default";

    // 1. Criar partida
    await repo.createMatch(matchId, roomName, modeName, 42);

    // 2. Registrar evento do cliente
    const seq1 = repo.recordEvent(
      matchId,
      "CLIENT",
      0,
      "EXTERNAL",
      "startGame",
      { modeName: "uno-default" },
    );

    // 3. Registrar evento do servidor
    const seq2 = repo.recordEvent(
      matchId,
      "SERVER",
      0,
      "EXTERNAL",
      "GameStartedEvent",
      { roomName, modeName },
    );

    // 4. Registrar evento de jogo (jogar carta)
    const seq3 = repo.recordEvent(
      matchId,
      "CLIENT",
      1,
      "GAME",
      "playCard",
      { cardId: "red-5" },
    );

    expect(seq1).toBe(1);
    expect(seq2).toBe(2);
    expect(seq3).toBe(3);

    // 5. Finalizar partida
    await repo.finishMatch(matchId, "FINISHED");

    // 6. Recuperar o replay completo
    const replay = await repo.getMatchReplay(matchId);

    expect(replay).not.toBeNull();
    expect(replay?.match.id).toBe(matchId);
    expect(replay?.match.roomId).toBe(room.id);
    expect(replay?.match.modeName).toBe(modeName);
    expect(replay?.match.seed).toBe(42);
    expect(replay?.match.status).toBe("FINISHED");
    expect(replay?.events).toHaveLength(3);

    expect(replay?.events[0].sequence).toBe(1);
    expect(replay?.events[0].source).toBe("CLIENT");
    expect(replay?.events[0].eventName).toBe("startGame");

    expect(replay?.events[1].sequence).toBe(2);
    expect(replay?.events[1].source).toBe("SERVER");
    expect(replay?.events[1].eventName).toBe("GameStartedEvent");

    expect(replay?.events[2].sequence).toBe(3);
    expect(replay?.events[2].source).toBe("CLIENT");
    expect(replay?.events[2].eventName).toBe("playCard");
  });

  it("deve buscar partidas gravadas por nome de sala via JOIN com a tabela rooms", async () => {
    const worker = createTestWorker();
    const repo = new ReplayRepository(worker);

    await repo.createMatch("m1", "sala-1", "mode-a");
    await repo.createMatch("m2", "sala-1", "mode-b");
    await repo.createMatch("m3", "sala-2", "mode-a");

    const sala1 = await repo.getRoomByName("sala-1");
    expect(sala1).not.toBeNull();

    const sala1Matches = await repo.getMatchesByRoom("sala-1");
    expect(sala1Matches).toHaveLength(2);
    expect(sala1Matches[0].roomId).toBe(sala1?.id);

    const sala2Matches = await repo.getMatchesByRoom("sala-2");
    expect(sala2Matches).toHaveLength(1);
    expect(sala2Matches[0].id).toBe("m3");
  });
});
