import { describe, expect, test, vi } from "vitest";
import { playCardEvent } from "../events/client/play-card.event.ts";
import { drawChoiceEvent } from "../events/client/draw.choice.event.ts";
import { defaultTimeoutAction } from "../events/client/default-timeout.action.ts";
import { jumpInEvent } from "../events/client/jumpin.event.ts";
import { DefautlEventManager } from "../events/event.manager.ts";
import { COLOR, Configs, Type } from "../cards/default.card.ts";
import { create7 } from "../cards/special-models/seven.model.ts";
import { create0 } from "../cards/special-models/zero.model.ts";
import {
  createMockCard,
  createMockDeckState,
  createMockPlayer,
  createMockState,
  createMockTurnState,
} from "./mocks.ts";

describe("Configurações de Regras Dinâmicas (Toggle Configs)", () => {
  describe("Zero e Sete sem efeito", () => {
    test("Se SEVEN_HAS_EFFECT for false, jogar a carta 7 não deve disparar troca de mãos", async () => {
      const configs: Configs = {
        SEVEN_HAS_EFFECT: false,
        ZERO_HAS_EFFECT: true,
        DRAW_2_OVER_DRAW_4: true,
        DRAW_UNTIL_HAVE: true,
        JUMPIN: true,
        DRAW_4_CHALLENGES: true,
      };

      const p1 = createMockPlayer(1);
      const p2 = createMockPlayer(2);

      const sevenCard = create7(configs, 100, COLOR.BLUE, "BLUE_7");
      p1.hand = [sevenCard];
      p2.hand = [createMockCard(200, Type.NUMBERED, COLOR.RED, 5)];

      const turnState = createMockTurnState([p1, p2]);
      const deckState = createMockDeckState([], createMockCard(999, Type.NUMBERED, COLOR.BLUE, 0));
      const state = createMockState([p1, p2], deckState, turnState);
      state.configs = configs;

      const eventManager = new DefautlEventManager(state);
      const spyWaitFor = vi.spyOn(eventManager, "waitForEvent");

      await playCardEvent.action(state, eventManager, { cardId: 100, playerId: 1, saidUno: true }, p1);

      // O evento de troca de mãos (selectHandEvent) não deve ter sido esperado
      expect(spyWaitFor).not.toHaveBeenCalledWith(
        expect.arrayContaining(["client:SELECT_HAND"]),
        expect.any(Number),
        expect.any(Array),
        expect.any(Array),
      );
      
      // As mãos não foram alteradas (exceto a carta 7 que foi descartada)
      expect(p1.hand.length).toBe(0);
      expect(p2.hand.length).toBe(1);
      expect(p2.hand[0].id).toBe(200);
    });

    test("Se ZERO_HAS_EFFECT for false, jogar a carta 0 não deve rotacionar as mãos", async () => {
      const configs: Configs = {
        SEVEN_HAS_EFFECT: true,
        ZERO_HAS_EFFECT: false,
        DRAW_2_OVER_DRAW_4: true,
        DRAW_UNTIL_HAVE: true,
        JUMPIN: true,
        DRAW_4_CHALLENGES: true,
      };

      const p1 = createMockPlayer(1);
      const p2 = createMockPlayer(2);

      const zeroCard = create0(configs, 100, COLOR.BLUE, "BLUE_0");
      const p1OriginalCard = createMockCard(101, Type.NUMBERED, COLOR.RED, 1);
      p1.hand = [zeroCard, p1OriginalCard];

      const p2OriginalCard = createMockCard(200, Type.NUMBERED, COLOR.RED, 5);
      p2.hand = [p2OriginalCard];

      const turnState = createMockTurnState([p1, p2]);
      const deckState = createMockDeckState([], createMockCard(999, Type.NUMBERED, COLOR.BLUE, 0));
      const state = createMockState([p1, p2], deckState, turnState);
      state.configs = configs;

      const eventManager = new DefautlEventManager(state);

      await playCardEvent.action(state, eventManager, { cardId: 100, playerId: 1, saidUno: true }, p1);

      // Como o efeito do Zero está desativo, as mãos não devem rotacionar.
      // P1 deve ter apenas a sua outra carta, e P2 deve ter a sua carta original.
      expect(p1.hand).toContain(p1OriginalCard);
      expect(p1.hand.length).toBe(1);
      expect(p2.hand).toContain(p2OriginalCard);
      expect(p2.hand.length).toBe(1);
    });
  });

  describe("Jump-In desativado", () => {
    test("Se JUMPIN for false, jogadas não devem aguardar eventos de Jump-In", async () => {
      const configs: Configs = {
        SEVEN_HAS_EFFECT: true,
        ZERO_HAS_EFFECT: true,
        DRAW_2_OVER_DRAW_4: true,
        DRAW_UNTIL_HAVE: true,
        JUMPIN: false,
        DRAW_4_CHALLENGES: true,
      };

      const p1 = createMockPlayer(1);
      const p2 = createMockPlayer(2);

      // P1 joga um 5 Azul
      const playedCard = createMockCard(100, Type.NUMBERED, COLOR.BLUE, 5);
      p1.hand = [playedCard];

      // P2 tem card idêntico para Jump-In (outro 5 Azul)
      const matchingCard = createMockCard(200, Type.NUMBERED, COLOR.BLUE, 5);
      p2.hand = [matchingCard];

      const turnState = createMockTurnState([p1, p2]);
      const deckState = createMockDeckState([], createMockCard(999, Type.NUMBERED, COLOR.BLUE, 0));
      const state = createMockState([p1, p2], deckState, turnState);
      state.configs = configs;

      const eventManager = new DefautlEventManager(state);
      const spyWaitFor = vi.spyOn(eventManager, "waitForEvent");

      await playCardEvent.action(state, eventManager, { cardId: 100, playerId: 1, saidUno: true }, p1);

      // Não deve ter esperado pela ação de JUMP_IN
      expect(spyWaitFor).not.toHaveBeenCalledWith(
        expect.arrayContaining([jumpInEvent.name]),
        expect.any(Number),
        expect.any(Array),
        expect.any(Array),
      );
    });
  });

  describe("Comprar até vir carta jogável (DRAW_UNTIL_HAVE)", () => {
    test("Se DRAW_UNTIL_HAVE for true, o jogador deve continuar comprando até vir uma jogável", async () => {
      const configs: Configs = {
        SEVEN_HAS_EFFECT: true,
        ZERO_HAS_EFFECT: true,
        DRAW_2_OVER_DRAW_4: true,
        DRAW_UNTIL_HAVE: true,
        JUMPIN: true,
        DRAW_4_CHALLENGES: true,
      };

      const p1 = createMockPlayer(1);
      const p2 = createMockPlayer(2);
      p1.hand = [];

      const topDiscard = createMockCard(999, Type.NUMBERED, COLOR.BLUE, 5);

      // Deck tem: Vermelho 3 (incompatível), Verde 8 (incompatível), Azul 9 (compatível)
      // Como o pop() tira do final do array, definimos a ordem de cima para baixo no deck
      const deck = [
        createMockCard(103, Type.NUMBERED, COLOR.BLUE, 9),  // 3a a ser comprada (jogável)
        createMockCard(102, Type.NUMBERED, COLOR.GREEN, 8), // 2a a ser comprada
        createMockCard(101, Type.NUMBERED, COLOR.RED, 3),   // 1a a ser comprada
      ];

      const turnState = createMockTurnState([p1, p2]);
      const deckState = createMockDeckState(deck, topDiscard);
      const state = createMockState([p1, p2], deckState, turnState);
      state.configs = configs;

      const eventManager = new DefautlEventManager(state);
      // Mockamos o waitForEvent para não bloquear ao notificar choose / keep
      vi.spyOn(eventManager, "waitForEvent").mockResolvedValue({ eventReturned: "client:KEEP_EVENT", data: {} });

      await drawChoiceEvent.action(state, eventManager, { playerId: 1 }, p1);

      // Deve ter comprado as 3 cartas (parando na Azul 9)
      expect(p1.hand.length).toBe(3);
      expect(p1.hand.map(c => c.id)).toContain(101);
      expect(p1.hand.map(c => c.id)).toContain(102);
      expect(p1.hand.map(c => c.id)).toContain(103);
    });

    test("Se DRAW_UNTIL_HAVE for false, o jogador deve comprar exatamente 1 carta e passar o turno", async () => {
      const configs: Configs = {
        SEVEN_HAS_EFFECT: true,
        ZERO_HAS_EFFECT: true,
        DRAW_2_OVER_DRAW_4: true,
        DRAW_UNTIL_HAVE: false, // Desabilitado
        JUMPIN: true,
        DRAW_4_CHALLENGES: true,
      };

      const p1 = createMockPlayer(1);
      const p2 = createMockPlayer(2);
      p1.hand = [];

      const topDiscard = createMockCard(999, Type.NUMBERED, COLOR.BLUE, 5);

      // Deck tem cartas incompatíveis, e depois uma compatível
      const deck = [
        createMockCard(103, Type.NUMBERED, COLOR.BLUE, 9),
        createMockCard(102, Type.NUMBERED, COLOR.GREEN, 8),
        createMockCard(101, Type.NUMBERED, COLOR.RED, 3),
      ];

      const turnState = createMockTurnState([p1, p2]);
      const deckState = createMockDeckState(deck, topDiscard);
      const state = createMockState([p1, p2], deckState, turnState);
      state.configs = configs;

      const eventManager = new DefautlEventManager(state);

      await drawChoiceEvent.action(state, eventManager, { playerId: 1 }, p1);

      // O jogador deve ter comprado exatamente 1 única carta (a de cima do deck, id 101)
      expect(p1.hand.length).toBe(1);
      expect(p1.hand[0].id).toBe(101);

      // E o turno deve ter passado para o próximo player (P2)
      expect(state.room.turn.currentPlayer.value.id).toBe(2);
    });

    test("defaultTimeoutAction com DRAW_UNTIL_HAVE: false deve comprar apenas 1 carta no timeout e passar turno", async () => {
      const configs: Configs = {
        SEVEN_HAS_EFFECT: true,
        ZERO_HAS_EFFECT: true,
        DRAW_2_OVER_DRAW_4: true,
        DRAW_UNTIL_HAVE: false,
        JUMPIN: true,
        DRAW_4_CHALLENGES: true,
      };

      const p1 = createMockPlayer(1);
      const p2 = createMockPlayer(2);
      p1.hand = [];

      const topDiscard = createMockCard(999, Type.NUMBERED, COLOR.BLUE, 5);
      const deck = [
        createMockCard(103, Type.NUMBERED, COLOR.BLUE, 9),
        createMockCard(102, Type.NUMBERED, COLOR.GREEN, 8),
        createMockCard(101, Type.NUMBERED, COLOR.RED, 3),
      ];

      const turnState = createMockTurnState([p1, p2]);
      const deckState = createMockDeckState(deck, topDiscard);
      const state = createMockState([p1, p2], deckState, turnState);
      state.configs = configs;

      const eventManager = new DefautlEventManager(state);

      await defaultTimeoutAction(state, eventManager, {}, p1);

      // Deve ter comprado exatamente 1 carta
      expect(p1.hand.length).toBe(1);
      expect(p1.hand[0].id).toBe(101);
      // Turno passou para P2
      expect(state.room.turn.currentPlayer.value.id).toBe(2);
    });

    test("defaultTimeoutAction com DRAW_UNTIL_HAVE: true deve comprar até vir carta jogável no timeout e passar turno", async () => {
      const configs: Configs = {
        SEVEN_HAS_EFFECT: true,
        ZERO_HAS_EFFECT: true,
        DRAW_2_OVER_DRAW_4: true,
        DRAW_UNTIL_HAVE: true,
        JUMPIN: true,
        DRAW_4_CHALLENGES: true,
      };

      const p1 = createMockPlayer(1);
      const p2 = createMockPlayer(2);
      p1.hand = [];

      const topDiscard = createMockCard(999, Type.NUMBERED, COLOR.BLUE, 5);
      const deck = [
        createMockCard(103, Type.NUMBERED, COLOR.BLUE, 9),  // jogável
        createMockCard(102, Type.NUMBERED, COLOR.GREEN, 8),
        createMockCard(101, Type.NUMBERED, COLOR.RED, 3),
      ];

      const turnState = createMockTurnState([p1, p2]);
      const deckState = createMockDeckState(deck, topDiscard);
      const state = createMockState([p1, p2], deckState, turnState);
      state.configs = configs;

      const eventManager = new DefautlEventManager(state);

      await defaultTimeoutAction(state, eventManager, {}, p1);

      // Deve ter comprado até a carta jogável (3 cartas)
      expect(p1.hand.length).toBe(3);
      expect(p1.hand.map((c) => c.id)).toEqual([101, 102, 103]);
      // Turno passou para P2
      expect(state.room.turn.currentPlayer.value.id).toBe(2);
    });

    test("Timeout na decisão pós-compra (PLAY_CARD vs KEEP_EVENT) deve apenas passar o turno sem comprar novamente", async () => {
      vi.useFakeTimers();

      const configs: Configs = {
        SEVEN_HAS_EFFECT: true,
        ZERO_HAS_EFFECT: true,
        DRAW_2_OVER_DRAW_4: true,
        DRAW_UNTIL_HAVE: true,
        JUMPIN: true,
        DRAW_4_CHALLENGES: true,
      };

      const p1 = createMockPlayer(1);
      const p2 = createMockPlayer(2);
      p1.hand = [];

      const topDiscard = createMockCard(999, Type.NUMBERED, COLOR.BLUE, 5);
      // Carta jogável de primeira (Azul 9 no topo do deck, ou seja, final do array)
      const deck = [
        createMockCard(102, Type.NUMBERED, COLOR.RED, 1),  // Fica no deck se não comprar de novo
        createMockCard(101, Type.NUMBERED, COLOR.BLUE, 9), // 1a a ser comprada (jogável)
      ];

      const turnState = createMockTurnState([p1, p2]);
      const deckState = createMockDeckState(deck, topDiscard);
      const state = createMockState([p1, p2], deckState, turnState);
      state.configs = configs;

      const eventManager = new DefautlEventManager(state);

      const drawPromise = drawChoiceEvent.action(state, eventManager, { playerId: 1 }, p1);

      // Avança o timer de 3000ms do waitForEvent
      await vi.advanceTimersByTimeAsync(3000);
      await drawPromise;

      // P1 comprou apenas 1 carta (101) e NÃO comprou a 102 por causa do timeout
      expect(p1.hand.length).toBe(1);
      expect(p1.hand[0].id).toBe(101);
      // Turno passou para P2
      expect(state.room.turn.currentPlayer.value.id).toBe(2);

      vi.useRealTimers();
    });
  });
});
