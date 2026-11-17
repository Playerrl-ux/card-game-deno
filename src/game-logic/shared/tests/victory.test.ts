import { describe, expect, test, vi } from "vitest";
import { playCardEvent } from "../events/client/play-card.event.ts";
import { jumpInEvent } from "../events/client/jumpin.event.ts";
import { drawChoiceEvent } from "../events/client/draw.choice.event.ts";
import { DefautlEventManager } from "../events/event.manager.ts";
import { COLOR, Configs, Type } from "../cards/default.card.ts";
import { ServerEventPayloads } from "../events/server/server-payloads.ts";
import {
  createMockCard,
  createMockDeckState,
  createMockPlayer,
  createMockState,
  createMockTurnState,
} from "./mocks.ts";

describe("Vitória do Jogador", () => {
  test("Sem CanWin ativo: deve apenas emitir o evento WIN se o jogador ficar sem cartas", async () => {
    const configs: Configs = {
      SEVEN_HAS_EFFECT: true,
      ZERO_HAS_EFFECT: true,
      DRAW_2_OVER_DRAW_4: true,
      DRAW_UNTIL_HAVE: true,
      JUMPIN: true,
      DRAW_4_CHALLENGES: true,
      CanWin: false,
    };

    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);

    const cardPlayed = createMockCard(100, Type.NUMBERED, COLOR.BLUE, 5);
    p1.hand = [cardPlayed]; // 1 carta na mão (ficará com 0 após jogar)
    p2.hand = [createMockCard(200, Type.NUMBERED, COLOR.RED, 3)];

    const turnState = createMockTurnState([p1, p2]);
    const deckState = createMockDeckState(
      [],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 0),
    );
    const state = createMockState([p1, p2], deckState, turnState);
    state.configs = configs;
    state.room.currentDraw = 2; // Cadeia de compra ativa

    const eventManager = new DefautlEventManager(state);
    const emitSpy = vi.spyOn(eventManager, "emitToClient");

    await playCardEvent.action(
      state,
      eventManager,
      { cardId: 100 },
      p1,
    );

    // O evento WIN deve ter sido emitido
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: ServerEventPayloads.WIN.broadcastName,
        data: {},
      }),
    );

    // Como CanWin é falso, o próximo jogador NÃO deve ter sido forçado a comprar automaticamente
    expect(state.room.currentDraw).toBe(2);
    expect(p2.hand.length).toBe(1);
  });

  test("Com CanWin ativo: deve fazer o próximo comprar cartas antes de declarar WIN", async () => {
    const configs: Configs = {
      SEVEN_HAS_EFFECT: true,
      ZERO_HAS_EFFECT: true,
      DRAW_2_OVER_DRAW_4: true,
      DRAW_UNTIL_HAVE: true,
      JUMPIN: true,
      DRAW_4_CHALLENGES: true,
      CanWin: true,
    };

    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);

    const cardPlayed = createMockCard(100, Type.NUMBERED, COLOR.BLUE, 5);
    p1.hand = [cardPlayed];
    p2.hand = [createMockCard(200, Type.NUMBERED, COLOR.RED, 3)];

    const turnState = createMockTurnState([p1, p2]);
    const deckState = createMockDeckState(
      [
        createMockCard(301, Type.NUMBERED, COLOR.YELLOW, 1),
        createMockCard(302, Type.NUMBERED, COLOR.YELLOW, 2),
      ],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 0),
    );
    const state = createMockState([p1, p2], deckState, turnState);
    state.configs = configs;
    state.room.currentDraw = 2; // Cadeia de compra ativa (+2)

    const eventManager = new DefautlEventManager(state);
    const emitSpy = vi.spyOn(eventManager, "emitToClient");

    await playCardEvent.action(
      state,
      eventManager,
      { cardId: 100 },
      p1,
    );

    // Como CanWin está ativo, o P2 deve ter sido forçado a comprar as 2 cartas
    expect(state.room.currentDraw).toBe(0); // Zerou a cadeia
    expect(p2.hand.length).toBe(3); // P2 tinha 1 carta, agora tem 3

    // O evento WIN deve ter sido emitido por último
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: ServerEventPayloads.WIN.broadcastName,
        data: {},
      }),
    );
  });

  test("Jump In - Sem CanWin ativo: deve apenas emitir o evento WIN se o jogador ficar sem cartas após Jump-In", async () => {
    const configs: Configs = {
      SEVEN_HAS_EFFECT: true,
      ZERO_HAS_EFFECT: true,
      DRAW_2_OVER_DRAW_4: true,
      DRAW_UNTIL_HAVE: true,
      JUMPIN: true,
      DRAW_4_CHALLENGES: true,
      CanWin: false,
    };

    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);

    const cardPlayed = createMockCard(100, Type.NUMBERED, COLOR.BLUE, 5);
    p2.hand = [cardPlayed];
    p1.hand = [createMockCard(200, Type.NUMBERED, COLOR.RED, 3)];

    const turnState = createMockTurnState([p1, p2]);
    const topCard = createMockCard(999, Type.NUMBERED, COLOR.BLUE, 5);
    const deckState = createMockDeckState([], topCard);
    deckState.wholeDeck = [];
    deckState.wholeDeck[100] = cardPlayed;
    deckState.wholeDeck[999] = topCard;

    const state = createMockState([p1, p2], deckState, turnState);
    state.configs = configs;
    state.room.currentDraw = 2;

    const eventManager = new DefautlEventManager(state);
    const emitSpy = vi.spyOn(eventManager, "emitToClient");

    await jumpInEvent.action(
      state,
      eventManager,
      { cardJumpedId: 100, targetId: 999 },
      p2,
    );

    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: ServerEventPayloads.WIN.broadcastName,
        data: {},
      }),
    );

    expect(state.room.currentDraw).toBe(2);
    expect(p1.hand.length).toBe(1);
  });

  test("Jump In - Com CanWin ativo: deve fazer o próximo comprar cartas antes de declarar WIN após Jump-In", async () => {
    const configs: Configs = {
      SEVEN_HAS_EFFECT: true,
      ZERO_HAS_EFFECT: true,
      DRAW_2_OVER_DRAW_4: true,
      DRAW_UNTIL_HAVE: true,
      JUMPIN: true,
      DRAW_4_CHALLENGES: true,
      CanWin: true,
    };

    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);

    const cardPlayed = createMockCard(100, Type.NUMBERED, COLOR.BLUE, 5);
    p2.hand = [cardPlayed];
    p1.hand = [createMockCard(200, Type.NUMBERED, COLOR.RED, 3)];

    const turnState = createMockTurnState([p1, p2]);
    const topCard = createMockCard(999, Type.NUMBERED, COLOR.BLUE, 5);
    const deckState = createMockDeckState(
      [
        createMockCard(301, Type.NUMBERED, COLOR.YELLOW, 1),
        createMockCard(302, Type.NUMBERED, COLOR.YELLOW, 2),
      ],
      topCard,
    );
    deckState.wholeDeck = [];
    deckState.wholeDeck[100] = cardPlayed;
    deckState.wholeDeck[999] = topCard;

    const state = createMockState([p1, p2], deckState, turnState);
    state.configs = configs;
    state.room.currentDraw = 2;

    const eventManager = new DefautlEventManager(state);
    const emitSpy = vi.spyOn(eventManager, "emitToClient");

    await jumpInEvent.action(
      state,
      eventManager,
      { cardJumpedId: 100, targetId: 999 },
      p2,
    );

    expect(state.room.currentDraw).toBe(0);
    expect(p1.hand.length).toBe(3);

    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: ServerEventPayloads.WIN.broadcastName,
        data: {},
      }),
    );
  });
});
