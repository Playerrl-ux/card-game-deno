import { describe, expect, test } from "vitest";
import { DefautlEventManager } from "../events/event.manager.ts";
import {
  createMockCard,
  createMockDeckState,
  createMockPlayer,
  createMockState,
  createMockTurnState,
} from "./mocks.ts";
import { COLOR, Type } from "../cards/default.card.ts";
import { serializeCard } from "../utils/card.utils.ts";

describe("EventManager - pendingWaitersInfo", () => {
  test("deve armazenar informacoes detalhadas dos waiters pendentes (action, cardId, players, etc.)", async () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const turnState = createMockTurnState([p1, p2]);
    const topCard = createMockCard(42, Type.NUMBERED, COLOR.BLUE, 5);
    const deckState = createMockDeckState([], topCard);
    const state = createMockState([p1, p2], deckState, turnState);

    const eventManager = new DefautlEventManager(state);

    expect(eventManager.pendingWaitersInfo).toEqual([]);
    expect(eventManager.waitersInfo).toEqual([]);

    // 1. Inicia waitForEvent passando meta explicita
    const pWait = eventManager.waitForEvent(
      ["client:PLAY_CARD"],
      1000,
      [p1],
      [serializeCard(topCard)],
      undefined,
      {
        action: "CUSTOM_ACTION",
        cardId: 42,
      },
    );

    expect(eventManager.pendingWaitersInfo.length).toBe(1);
    const info = eventManager.pendingWaitersInfo[0];
    expect(info.id).toBeDefined();
    expect(info.action).toBe("CUSTOM_ACTION");
    expect(info.cardId).toBe(42);
    expect(info.eventsName).toEqual(["client:PLAY_CARD"]);
    expect(info.players).toEqual([p1.id]);
    expect(typeof info.createdAt).toBe("number");

    // 2. Resolve o evento e valida que foi removido de pendingWaitersInfo
    eventManager.emit("client:PLAY_CARD", {}, p1);
    await pWait;

    expect(eventManager.pendingWaitersInfo.length).toBe(0);
    expect(eventManager.waitersInfo.length).toBe(0);
  });

  test("deve inferir cardId a partir de allowedCards quando cardId nao for explicitamente passado", async () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const turnState = createMockTurnState([p1, p2]);
    const singleCard = createMockCard(99, Type.NUMBERED, COLOR.RED, 7);
    const deckState = createMockDeckState([], singleCard);
    const state = createMockState([p1, p2], deckState, turnState);

    const eventManager = new DefautlEventManager(state);

    const pWait = eventManager.waitForEvent(
      ["client:SELECT_HAND"],
      1000,
      [p1],
      [serializeCard(singleCard)],
    );

    expect(eventManager.pendingWaitersInfo.length).toBe(1);
    expect(eventManager.pendingWaitersInfo[0].cardId).toBe(99);
    expect(eventManager.pendingWaitersInfo[0].action).toBe("client:SELECT_HAND");

    eventManager.emit("client:SELECT_HAND", {}, p1);
    await pWait;
    expect(eventManager.pendingWaitersInfo.length).toBe(0);
  });

  test("cancelAllWaiters deve limpar o array pendingWaitersInfo", async () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const turnState = createMockTurnState([p1, p2]);
    const deckState = createMockDeckState([], createMockCard(1, Type.NUMBERED, COLOR.BLUE, 1));
    const state = createMockState([p1, p2], deckState, turnState);

    const eventManager = new DefautlEventManager(state);

    const pWait = eventManager.waitForEvent(
      ["client:PLAY_CARD"],
      1000,
      [p1],
      [],
      undefined,
      { action: "TEST_ACTION", cardId: 10 },
    );
    // Adiciona catch para evitar unhandled rejection no teste
    pWait.catch(() => {});

    expect(eventManager.pendingWaitersInfo.length).toBe(1);

    eventManager.cancelAllWaiters();

    expect(eventManager.pendingWaitersInfo.length).toBe(0);
  });
});
