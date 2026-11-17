import { describe, expect, test } from "vitest";
import { DefaultPlayerManager } from "../player/default.player.manager.ts";
import {
  createMockCard,
  createMockPlayer,
  createMockDeckState,
  createMockTurnState,
  createMockState,
} from "./mocks.ts";
import { COLOR, Type } from "../cards/default.card.ts";

describe("DefaultPlayerManager", () => {
  test("getCard deve retornar o card correto se existir na mão", () => {
    const card = createMockCard(10, Type.NUMBERED, COLOR.BLUE, 5);
    const player = createMockPlayer(1, [card]);

    const result = DefaultPlayerManager.getCard(10, player);
    expect(result).toBe(card);
  });

  test("getCard deve retornar undefined se o card não existir na mão", () => {
    const player = createMockPlayer(1, []);
    const result = DefaultPlayerManager.getCard(10, player);
    expect(result).toBeUndefined();
  });

  test("play deve remover o card da mão do jogador e retorná-lo", () => {
    const card1 = createMockCard(10, Type.NUMBERED, COLOR.BLUE, 5);
    const card2 = createMockCard(20, Type.NUMBERED, COLOR.RED, 3);
    const player = createMockPlayer(1, [card1, card2]);

    const result = DefaultPlayerManager.play(20, player);
    expect(result).toBe(card2);
    expect(player.hand).toEqual([card1]);
  });

  test("play deve retornar undefined se tentar jogar um card que não está na mão", () => {
    const player = createMockPlayer(1, []);
    const result = DefaultPlayerManager.play(99, player);
    expect(result).toBeUndefined();
  });

  test("addCards deve acrescentar cards à mão do jogador", () => {
    const player = createMockPlayer(1, []);
    const cards = [
      createMockCard(1, Type.NUMBERED, COLOR.BLUE, 1),
      createMockCard(2, Type.NUMBERED, COLOR.GREEN, 2),
    ];

    DefaultPlayerManager.addCards(cards, player);
    expect(player.hand).toEqual(cards);
  });

  test("checkPlayCard deve filtrar apenas os cards válidos sobre a pilha de descarte", () => {
    // Topo de descarte: Vermelho 5
    const discardTop = createMockCard(99, Type.NUMBERED, COLOR.RED, 5);

    // Mão do jogador:
    // 1. Azul 5 (Compatível pelo valor 5)
    // 2. Vermelho 2 (Compatível pela cor vermelha)
    // 3. Verde 3 (Incompatível)
    // 4. Wild Card (Sempre compatível)
    const card1 = createMockCard(1, Type.NUMBERED, COLOR.BLUE, 5);
    const card2 = createMockCard(2, Type.NUMBERED, COLOR.RED, 2);
    const card3 = createMockCard(3, Type.NUMBERED, COLOR.GREEN, 3);
    const card4 = createMockCard(4, Type.WILD_CARD, COLOR.WILD);

    const player = createMockPlayer(1, [card1, card2, card3, card4]);
    const deckState = createMockDeckState([], discardTop);
    const player2 = createMockPlayer(2);
    const turnState = createMockTurnState([player, player2]);
    const state = createMockState([player, player2], deckState, turnState);

    const result = DefaultPlayerManager.checkPlayCard(discardTop, player, state);
    expect(result).toContain(card1);
    expect(result).toContain(card2);
    expect(result).toContain(card4);
    expect(result).not.toContain(card3);
    expect(result.length).toBe(3);
  });
});
