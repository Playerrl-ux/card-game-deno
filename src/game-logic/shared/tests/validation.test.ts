import { describe, expect, test, vi } from "vitest";
import { playCardEvent } from "../events/client/play-card.event.ts";
import { jumpInEvent } from "../events/client/jumpin.event.ts";
import { selectHandEvent } from "../events/client/select-hand.event.ts";
import { DefaultEventGuard } from "../events/event.guard.ts";
import { EventSocket } from "../../base/event.guard.ts";
import { COLOR, Type } from "../cards/default.card.ts";
import {
  createMockCard,
  createMockDeckState,
  createMockPlayer,
  createMockState,
  createMockTurnState,
} from "./mocks.ts";

describe("Testes Negativos de Validação de Eventos do Cliente", () => {
  const mockNetworkLayer: EventSocket = {
    handle: vi.fn(),
  };

  test("Play Card - Não deve permitir jogar carta que não está na mão do jogador", () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);

    p1.hand = [createMockCard(101, Type.NUMBERED, COLOR.BLUE, 5)];

    const turnState = createMockTurnState([p1, p2]);
    const deckState = createMockDeckState(
      [],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 0),
    );
    const state = createMockState([p1, p2], deckState, turnState);

    state.eventsValidMap.resetAll();
    state.eventsValidMap.set(p1, [playCardEvent.name]);

    const guard = new DefaultEventGuard(state);
    const emitSpy = vi.spyOn(guard.eventManager, "emit");

    expect(() => {
      guard.guard(p1, playCardEvent.name, {
        cardId: 202,
        playerId: 1,
      });
    }).toThrow("Invalid data for event: client:PLAY_CARD");

    expect(emitSpy).not.toHaveBeenCalledWith(
      playCardEvent.name,
      expect.anything(),
      expect.anything(),
    );
    expect(emitSpy).toHaveBeenCalledWith("ROOM_ERROR", expect.anything());
  });

  test("Play Card - Não deve permitir jogar carta que não pode ser colocada sobre o descarte", () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);

    p1.hand = [createMockCard(101, Type.NUMBERED, COLOR.RED, 3)];

    const turnState = createMockTurnState([p1, p2]);
    const deckState = createMockDeckState(
      [],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 7),
    );
    const state = createMockState([p1, p2], deckState, turnState);

    state.eventsValidMap.resetAll();
    state.eventsValidMap.set(p1, [playCardEvent.name]);

    const guard = new DefaultEventGuard(state);
    const emitSpy = vi.spyOn(guard.eventManager, "emit");

    expect(() => {
      guard.guard(p1, playCardEvent.name, {
        cardId: 101,
        playerId: 1,
      });
    }).toThrow("Invalid data for event: client:PLAY_CARD");

    expect(emitSpy).not.toHaveBeenCalledWith(
      playCardEvent.name,
      expect.anything(),
      expect.anything(),
    );
    expect(emitSpy).toHaveBeenCalledWith("ROOM_ERROR", expect.anything());
  });

  test("Jump In - Não deve permitir Jump-In se o card no descarte mudou (targetId diferente)", () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);

    const cardHand = createMockCard(101, Type.NUMBERED, COLOR.BLUE, 7);
    p1.hand = [cardHand];

    const turnState = createMockTurnState([p1, p2]);
    const topCard = createMockCard(999, Type.NUMBERED, COLOR.BLUE, 7);
    const deckState = createMockDeckState([], topCard);

    const state = createMockState([p1, p2], deckState, turnState);

    state.eventsValidMap.resetAll();
    state.eventsValidMap.set(p1, [jumpInEvent.name]);

    const guard = new DefaultEventGuard(state);
    const emitSpy = vi.spyOn(guard.eventManager, "emit");

    expect(() => {
      guard.guard(p1, jumpInEvent.name, {
        cardJumpedId: 101,
        targetId: 888,
        playerId: 1,
      });
    }).toThrow("Invalid data for event: client:JUMP_IN");

    expect(emitSpy).not.toHaveBeenCalledWith(
      jumpInEvent.name,
      expect.anything(),
      expect.anything(),
    );
    expect(emitSpy).toHaveBeenCalledWith("ROOM_ERROR", expect.anything());
  });

  test("Jump In - Não deve permitir Jump-In com carta de nome diferente da do topo", () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);

    const cardHand = createMockCard(101, Type.NUMBERED, COLOR.BLUE, 5);
    p1.hand = [cardHand];
    const topCard = createMockCard(999, Type.NUMBERED, COLOR.BLUE, 7);
    const deckState = createMockDeckState([], topCard);
    deckState.wholeDeck = [cardHand, topCard];

    const turnState = createMockTurnState([p1, p2]);
    const state = createMockState([p1, p2], deckState, turnState);

    state.eventsValidMap.resetAll();
    state.eventsValidMap.set(p1, [jumpInEvent.name]);

    const guard = new DefaultEventGuard(state);
    const emitSpy = vi.spyOn(guard.eventManager, "emit");

    expect(() => {
      guard.guard(p1, jumpInEvent.name, {
        cardJumpedId: 101,
        targetId: 999,
        playerId: 1,
      });
    }).toThrow("Invalid data for event: client:JUMP_IN");

    expect(emitSpy).not.toHaveBeenCalledWith(
      jumpInEvent.name,
      expect.anything(),
      expect.anything(),
    );
    expect(emitSpy).toHaveBeenCalledWith("ROOM_ERROR", expect.anything());
  });

  test("Jump In - Não deve permitir Jump-In se a carta não estiver na mão do jogador", () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);

    const cardHand = createMockCard(101, Type.NUMBERED, COLOR.BLUE, 7);
    p1.hand = []; // Não tem a carta
    const topCard = createMockCard(999, Type.NUMBERED, COLOR.BLUE, 7);
    const deckState = createMockDeckState([], topCard);
    deckState.wholeDeck = [cardHand, topCard];

    const turnState = createMockTurnState([p1, p2]);
    const state = createMockState([p1, p2], deckState, turnState);

    state.eventsValidMap.resetAll();
    state.eventsValidMap.set(p1, [jumpInEvent.name]);

    const guard = new DefaultEventGuard(state);
    const emitSpy = vi.spyOn(guard.eventManager, "emit");

    expect(() => {
      guard.guard(p1, jumpInEvent.name, {
        cardJumpedId: 101,
        targetId: 999,
        playerId: 1,
      });
    }).toThrow("Invalid data for event: client:JUMP_IN");

    expect(emitSpy).not.toHaveBeenCalledWith(
      jumpInEvent.name,
      expect.anything(),
      expect.anything(),
    );
    expect(emitSpy).toHaveBeenCalledWith("ROOM_ERROR", expect.anything());
  });

  test("Select Hand - Não deve permitir selecionar se o jogador de envio não for o atual", () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);

    const turnState = createMockTurnState([p1, p2]);
    turnState.currentPlayer = turnState.players.head!;

    const deckState = createMockDeckState(
      [],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 0),
    );
    const state = createMockState([p1, p2], deckState, turnState);

    state.eventsValidMap.resetAll();
    state.eventsValidMap.set(p2, [selectHandEvent.name]);

    const guard = new DefaultEventGuard(state);
    const emitSpy = vi.spyOn(guard.eventManager, "emit");

    expect(() => {
      guard.guard(p2, selectHandEvent.name, {
        playerId: 2,
        targetId: 1,
      });
    }).toThrow("Invalid data for event: client:SELECT_HAND");

    expect(emitSpy).not.toHaveBeenCalledWith(
      selectHandEvent.name,
      expect.anything(),
      expect.anything(),
    );
    expect(emitSpy).toHaveBeenCalledWith("ROOM_ERROR", expect.anything());
  });

  test("Select Hand - Não deve permitir trocar de mão com você mesmo", () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);

    const turnState = createMockTurnState([p1, p2]);
    turnState.currentPlayer = turnState.players.head!;

    const deckState = createMockDeckState(
      [],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 0),
    );
    const state = createMockState([p1, p2], deckState, turnState);

    state.eventsValidMap.resetAll();
    state.eventsValidMap.set(p1, [selectHandEvent.name]);

    const guard = new DefaultEventGuard(state);
    const emitSpy = vi.spyOn(guard.eventManager, "emit");

    expect(() => {
      guard.guard(p1, selectHandEvent.name, {
        playerId: 1,
        targetId: 1,
      });
    }).toThrow("Invalid data for event: client:SELECT_HAND");

    expect(emitSpy).not.toHaveBeenCalledWith(
      selectHandEvent.name,
      expect.anything(),
      expect.anything(),
    );
    expect(emitSpy).toHaveBeenCalledWith("ROOM_ERROR", expect.anything());
  });

  test("EventGuard - Deve emitir RoomErrorEvent ao receber ação não permitida", () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);

    const turnState = createMockTurnState([p1, p2]);
    const deckState = createMockDeckState(
      [],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 0),
    );
    const state = createMockState([p1, p2], deckState, turnState);

    state.eventsValidMap.resetAll(); // p1 não tem permissão

    const sentEventsP1: any[] = [];
    p1.network.sendToPlayer = (event: any) => sentEventsP1.push(event);

    const guard = new DefaultEventGuard(state);

    expect(() => {
      guard.guard(p1, playCardEvent.name, { cardId: 101, playerId: 1 });
    }).toThrow("Player isnt allowed to do this event: client:PLAY_CARD");

    const errorEvent = sentEventsP1.find((e) => e.name === "ROOM_ERROR");
    expect(errorEvent).toBeDefined();
    expect(errorEvent.data.message).toContain("Player isnt allowed to do this event");
  });

  test("EventGuard - Deve emitir RoomErrorEvent ao receber dados inválidos", () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    p1.hand = [createMockCard(101, Type.NUMBERED, COLOR.RED, 3)];

    const turnState = createMockTurnState([p1, p2]);
    const deckState = createMockDeckState(
      [],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 7),
    );
    const state = createMockState([p1, p2], deckState, turnState);

    state.eventsValidMap.resetAll();
    state.eventsValidMap.set(p1, [playCardEvent.name]);

    const sentEventsP1: any[] = [];
    p1.network.sendToPlayer = (event: any) => sentEventsP1.push(event);

    const guard = new DefaultEventGuard(state);

    expect(() => {
      guard.guard(p1, playCardEvent.name, { cardId: 101, playerId: 1 });
    }).toThrow("Invalid data for event: client:PLAY_CARD");

    const errorEvent = sentEventsP1.find((e) => e.name === "ROOM_ERROR");
    expect(errorEvent).toBeDefined();
    expect(errorEvent.data.message).toContain("Invalid data for event");
  });
});
