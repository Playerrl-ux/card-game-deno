import { describe, expect, test } from "vitest";
import { DefautlEventManager } from "../events/event.manager.ts";
import {
  createMockCard,
  createMockPlayer,
  createMockState,
  createMockTurnState,
  createMockDeckState,
} from "./mocks.ts";
import { COLOR, Type } from "../cards/default.card.ts";

describe("DefautlEventManager.initGame", () => {
  test("deve distribuir cartas, enviar NEW_HAND individual, emitir GameStartedEvent (com wholeDeck e initialDiscard) antes das permissões", async () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const players = [p1, p2];

    const deckCards = Array.from({ length: 20 }, (_, i) =>
      createMockCard(i + 1, Type.NUMBERED, COLOR.BLUE, i % 10),
    );

    const turnState = createMockTurnState(players);
    const deckState = createMockDeckState(
      deckCards,
      createMockCard(999, Type.NUMBERED, COLOR.RED, 5),
    );
    const state = createMockState(players, deckState, turnState);

    const eventManager = new DefautlEventManager(state);

    const sentEventsP1: any[] = [];
    const sentEventsP2: any[] = [];

    p1.network.sendToPlayer = (event: any) => sentEventsP1.push(event);
    p2.network.sendToPlayer = (event: any) => sentEventsP2.push(event);

    eventManager.initGame("room1", "Default");

    // Aguarda microtask para emissão das permissões do turno inicial
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));

    // 1. Cada jogador recebe 7 cartas
    expect(p1.hand.length).toBe(7);
    expect(p2.hand.length).toBe(7);

    // 2. Evento NEW_HAND recebido individualmente por cada jogador
    const p1Hand = sentEventsP1.find((e) => e.name === "NEW_HAND");
    const p2Hand = sentEventsP2.find((e) => e.name === "NEW_HAND");
    expect(p1Hand).toBeDefined();
    expect(p2Hand).toBeDefined();
    expect(p1Hand.data.playerId).toBe(1);
    expect(p2Hand.data.playerId).toBe(2);

    // 3. Evento GAME_STARTED emitido para todos com wholeDeck e initialDiscard
    const p1GameStarted = sentEventsP1.find((e) => e.name === "GAME_STARTED");
    const p2GameStarted = sentEventsP2.find((e) => e.name === "GAME_STARTED");
    expect(p1GameStarted).toBeDefined();
    expect(p2GameStarted).toBeDefined();

    expect(p1GameStarted.data.initialDiscard).toBeDefined();
    expect(p1GameStarted.data.initialDiscard.id).toBe(999);

    // 4. Ordem dos eventos: GAME_STARTED < NEW_HAND < PERMISSIONS
    const gameStartedIndex = sentEventsP1.findIndex((e) => e.name === "GAME_STARTED");
    const newHandIndex = sentEventsP1.findIndex((e) => e.name === "NEW_HAND");
    const permissionsIndex = sentEventsP1.findIndex((e) => e.name === "PERMISSIONS");

    expect(gameStartedIndex).toBeGreaterThan(-1);
    expect(newHandIndex).toBeGreaterThan(gameStartedIndex);
    expect(permissionsIndex).toBeGreaterThan(newHandIndex);
  });
});
