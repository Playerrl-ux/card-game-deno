import { describe, expect, test, vi } from "vitest";
import { DefaultDeckManager } from "../state/functions/deck.functions.ts";
import { COLOR, Type, Card, Configs } from "../cards/default.card.ts";
import { createMockCard } from "./mocks.ts";

describe("Deck & Discard Pile - Casos de Borda", () => {
  const configs: Configs = {
    SEVEN_HAS_EFFECT: true,
    ZERO_HAS_EFFECT: true,
    DRAW_2_OVER_DRAW_4: true,
    DRAW_UNTIL_HAVE: true,
    JUMPIN: true,
    DRAW_4_CHALLENGES: true,
  };

  test("Monte de compra vazio: deve mover as cartas do descarte, embaralhá-las e manter o topDiscard intacto", () => {
    const topDiscard = createMockCard(999, Type.NUMBERED, COLOR.RED, 5);
    const cardDiscarded1 = createMockCard(101, Type.NUMBERED, COLOR.BLUE, 3);
    const cardDiscarded2 = createMockCard(102, Type.NUMBERED, COLOR.GREEN, 8);

    const deckState = {
      wholeDeck: [cardDiscarded1, cardDiscarded2, topDiscard],
      baseCards: [],
      deck: [], // monte de compra vazio
      discardPile: [cardDiscarded1, cardDiscarded2],
      topDiscard: topDiscard,
    };

    // Compra 2 cartas
    const drawn = DefaultDeckManager.draw(2, deckState);

    // Asserções
    expect(drawn.length).toBe(2);
    expect(drawn).toContain(cardDiscarded1);
    expect(drawn).toContain(cardDiscarded2);
    
    // O descarte e o monte temporário de compra foram esgotados
    expect(deckState.deck.length).toBe(0);
    expect(deckState.discardPile.length).toBe(0);
    
    // O topo do descarte original deve ter permanecido intocado
    expect(deckState.topDiscard).toBe(topDiscard);
  });

  test("Ambos os montes vazios/mão zerada: não deve quebrar ou travar, deve responder elegantemente com array vazio", () => {
    const topDiscard = createMockCard(999, Type.NUMBERED, COLOR.RED, 5);

    const deckState = {
      wholeDeck: [topDiscard],
      baseCards: [],
      deck: [], // monte de compra vazio
      discardPile: [], // monte de descarte vazio
      topDiscard: topDiscard,
    };

    // Tenta comprar 1 carta
    expect(() => {
      const drawn = DefaultDeckManager.draw(1, deckState);
      expect(drawn).toEqual([]);
    }).not.toThrow();

    expect(deckState.deck).toEqual([]);
    expect(deckState.discardPile).toEqual([]);
    expect(deckState.topDiscard).toBe(topDiscard);
  });

  test("Distribuição Inicial: a primeira carta aberta no descarte (topDiscard) não deve ser de efeito/especial que impacte o fluxo inicial", () => {
    const quantities = {
      BLUE_0: 1,
      BLUE_SKIP: 1,
    };

    // Forçamos o shuffle a colocar a carta de efeito (BLUE_SKIP) no fim do array,
    // de modo que ela seja a primeira a ser retirada pelo pop() para ser o topDiscard inicial.
    const spyShuffle = vi.spyOn(DefaultDeckManager, "shuffle").mockImplementation((cards) => {
      const copy = [...cards];
      const skipIndex = copy.findIndex((c) => c.type === Type.BLOCK || c.name.includes("SKIP"));
      if (skipIndex !== -1) {
        const [skipCard] = copy.splice(skipIndex, 1);
        copy.push(skipCard); // coloca no fim do array para sofrer o pop()
      }
      return copy;
    });

    try {
      const deckState = DefaultDeckManager.createDeckState(quantities, 1, configs);

      // A primeira carta aberta não deve ser uma carta de efeito/especial no primeiro turno,
      // pois inviabilizaria ou aplicaria penalidades indevidas ao primeiro jogador.
      expect(deckState.topDiscard.type).toBe(Type.NUMBERED);
    } finally {
      spyShuffle.mockRestore();
    }
  });
});
