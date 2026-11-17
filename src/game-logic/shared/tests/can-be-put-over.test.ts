import { describe, expect, test } from "vitest";
import { Card, COLOR, Configs, Type, baseCanBePutOver } from "../cards/default.card.ts";
import { createDraw2 } from "../cards/special-models/draw-2.model.ts";
import { createWild } from "../cards/special-models/wild-card.model.ts";
import { createBlock } from "../cards/special-models/block.model.ts";
import { draw4BeforeEffect, draw4AfterEffect, draw4CanBePutOver } from "../cards/special-models/draw-4.model.ts";
import {
  createMockCard,
  createMockDeckState,
  createMockPlayer,
  createMockState,
  createMockTurnState,
} from "./mocks.ts";

describe("Regras da Carta - canBePutOver", () => {
  const defaultConfigs: Configs = {
    SEVEN_HAS_EFFECT: true,
    ZERO_HAS_EFFECT: true,
    DRAW_2_OVER_DRAW_4: true,
    DRAW_UNTIL_HAVE: true,
    JUMPIN: true,
    DRAW_4_CHALLENGES: true,
  };

  // Helper para criar o mock de state necessário sem quebrar pela lista circular circular de turnos
  const createTestState = (
    topDiscard: Card,
    currentDraw: number = 0,
    customConfigs?: Partial<Configs>,
  ) => {
    const players = [createMockPlayer(1), createMockPlayer(2)];
    const deckState = createMockDeckState([], topDiscard);
    const turnState = createMockTurnState(players);
    const state = createMockState(players, deckState, turnState);
    state.room.currentDraw = currentDraw;
    if (customConfigs) {
      state.configs = { ...state.configs, ...customConfigs };
    }
    return state;
  };

  // Helper para criar um WILD_DRAW_FOUR
  const createDraw4 = (id: number): Card => ({
    id,
    name: "WILD_DRAW_FOUR",
    value: undefined,
    color: COLOR.WILD,
    effectiveColor: undefined,
    type: Type.DRAW_4,
    effectBefore: draw4BeforeEffect,
    effectAfter: draw4AfterEffect,
    canBePutOver: draw4CanBePutOver,
  });

  describe("Compatibilidade Básica (Cores, Valores e Efeitos)", () => {
    test("Deve permitir jogar cartas da mesma cor", () => {
      const topDiscard = createMockCard(1, Type.NUMBERED, COLOR.BLUE, 3);
      const playedCard = createMockCard(2, Type.NUMBERED, COLOR.BLUE, 8);
      const state = createTestState(topDiscard);

      expect(playedCard.canBePutOver(playedCard, topDiscard, state)).toBe(true);
    });

    test("Deve permitir jogar cartas do mesmo número/valor", () => {
      const topDiscard = createMockCard(1, Type.NUMBERED, COLOR.BLUE, 5);
      const playedCard = createMockCard(2, Type.NUMBERED, COLOR.RED, 5);
      const state = createTestState(topDiscard);

      expect(playedCard.canBePutOver(playedCard, topDiscard, state)).toBe(true);
    });

    test("Deve permitir jogar cartas de mesmo efeito/tipo (ex: Block sobre Block)", () => {
      const topDiscard = createBlock(1, COLOR.BLUE, "BLUE_BLOCK");
      const playedCard = createBlock(2, COLOR.YELLOW, "YELLOW_BLOCK");
      const state = createTestState(topDiscard);

      expect(playedCard.canBePutOver(playedCard, topDiscard, state)).toBe(true);
    });

    test("Não deve permitir jogar cartas incompatíveis de cor, valor ou tipo diferente", () => {
      const topDiscard = createMockCard(1, Type.NUMBERED, COLOR.BLUE, 8);
      const playedCard = createMockCard(2, Type.NUMBERED, COLOR.RED, 3);
      const state = createTestState(topDiscard);

      expect(playedCard.canBePutOver(playedCard, topDiscard, state)).toBe(false);
    });

    test("Coringas padrão (WILD) devem ser compatíveis sobre qualquer cor/tipo", () => {
      const topDiscard = createMockCard(1, Type.NUMBERED, COLOR.BLUE, 8);
      const playedCard = createWild(2, "WILD_CARD");
      const state = createTestState(topDiscard);

      expect(playedCard.canBePutOver(playedCard, topDiscard, state)).toBe(true);
    });

    test("Coringas +4 (DRAW_4) devem ser compatíveis sobre qualquer cor/tipo", () => {
      const topDiscard = createMockCard(1, Type.NUMBERED, COLOR.GREEN, 2);
      const playedCard = createDraw4(2);
      const state = createTestState(topDiscard);

      expect(playedCard.canBePutOver(playedCard, topDiscard, state)).toBe(true);
    });
  });

  describe("Validação de Cor Escolhida (effectiveColor)", () => {
    test("Deve aceitar cartas da cor escolhida pelo coringa anterior", () => {
      const topDiscard = createWild(1, "WILD_CARD");
      topDiscard.effectiveColor = COLOR.RED;

      const playedCard = createMockCard(2, Type.NUMBERED, COLOR.RED, 3); // Compatível por cor
      const state = createTestState(topDiscard);

      expect(playedCard.canBePutOver(playedCard, topDiscard, state)).toBe(true);
    });

    test("Não deve aceitar cartas diferentes da cor escolhida, mesmo que possuam o mesmo valor/tipo de cartas de antes do coringa", () => {
      const topDiscard = createWild(1, "WILD_CARD");
      topDiscard.effectiveColor = COLOR.RED;

      const playedCard = createMockCard(2, Type.NUMBERED, COLOR.BLUE, 5); 
      const state = createTestState(topDiscard);

      expect(playedCard.canBePutOver(playedCard, topDiscard, state)).toBe(false);
    });

    test("Deve sempre permitir jogar outro coringa sobre uma cor escolhida anteriormente", () => {
      const topDiscard = createWild(1, "WILD_CARD");
      topDiscard.effectiveColor = COLOR.RED;

      const playedCard = createWild(2, "WILD_CARD");
      const state = createTestState(topDiscard);

      expect(playedCard.canBePutOver(playedCard, topDiscard, state)).toBe(true);
    });
  });

  describe("Acúmulo de +2 sobre +4 (Configurações e Cadeias de Compra)", () => {
    test("Deve aceitar +2 azul sobre +4 se DRAW_2_OVER_DRAW_4 estiver habilitado e a cadeia de compras estiver ativa", () => {
      const topDiscard = createDraw4(1);
      topDiscard.effectiveColor = COLOR.BLUE;
      const playedCard = createDraw2(defaultConfigs, 2, COLOR.BLUE, "BLUE_DRAW_2");

      const state = createTestState(topDiscard, 4); // Cadeia de compras ativa (+4 pendente)

      expect(playedCard.canBePutOver(playedCard, topDiscard, state)).toBe(true);
    });

    test("Não deve aceitar +2 azul sobre +4 se DRAW_2_OVER_DRAW_4 estiver habilitado mas a cadeia de compras NÃO estiver ativa (acumulador zerado)", () => {
      const topDiscard = createDraw4(1);
      topDiscard.effectiveColor = COLOR.RED; // Cor escolhida

      const playedCard = createDraw2(defaultConfigs, 2, COLOR.BLUE, "BLUE_DRAW_2");

      const state = createTestState(topDiscard, 0); // Acumulador zerado

      expect(playedCard.canBePutOver(playedCard, topDiscard, state)).toBe(false);
    });

    test("Deve aceitar +2 vermelho sobre +4 (cor correspondente) mesmo com o acumulador zerado", () => {
      const topDiscard = createDraw4(1);
      topDiscard.effectiveColor = COLOR.RED; // Cor escolhida vermelha

      const playedCard = createDraw2(defaultConfigs, 2, COLOR.RED, "RED_DRAW_2");

      const state = createTestState(topDiscard, 0); // Acumulador zerado

      expect(playedCard.canBePutOver(playedCard, topDiscard, state)).toBe(true);
    });

    test("Não deve aceitar +2 sobre +4 se a flag DRAW_2_OVER_DRAW_4 estiver DESABILITADA, mesmo com a cadeia de compras ativa", () => {
      const configs = { ...defaultConfigs, DRAW_2_OVER_DRAW_4: false };

      const topDiscard = createDraw4(1);
      const playedCard = createDraw2(configs, 2, COLOR.BLUE, "BLUE_DRAW_2");

      const state = createTestState(topDiscard, 4, configs); // Cadeia ativa, mas config desabilitada

      expect(playedCard.canBePutOver(playedCard, topDiscard, state)).toBe(false);
    });
  });
});
