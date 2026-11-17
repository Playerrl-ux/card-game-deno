import { describe, expect, test } from "vitest";
import { DefaultDeckManager } from "../state/functions/deck.functions.ts";
import {
  createMockCard,
  createMockDeckState,
  createMockPlayer,
  createMockState,
  createMockTurnState,
} from "./mocks.ts";
import { COLOR, Type } from "../cards/default.card.ts";

describe("DefaultDeckManager", () => {
  test("discard deve empilhar a carta atual da pilha de descarte e limpar any cor efetiva", () => {
    // Carta A na mesa com cor efetiva modificada (ex. por ser Wild)
    const cardA = createMockCard(1, Type.WILD_CARD, COLOR.WILD);
    cardA.effectiveColor = COLOR.GREEN;

    // Nova carta B a ser descartada
    const cardB = createMockCard(2, Type.NUMBERED, COLOR.BLUE, 7);

    // Estado inicial
    const deckState = createMockDeckState([], cardA);

    DefaultDeckManager.discard(cardB, deckState);

    // CardA deve ir para discardPile e perder effectiveColor
    expect(deckState.discardPile).toContain(cardA);
    expect(cardA.effectiveColor).toBeUndefined();

    // CardB deve ser o novo topDiscard
    expect(deckState.topDiscard).toBe(cardB);
  });

  test("draw deve retirar a quantidade desejada de cartas do deck", () => {
    const cards = [
      createMockCard(1, Type.NUMBERED, COLOR.BLUE, 1),
      createMockCard(2, Type.NUMBERED, COLOR.BLUE, 2),
      createMockCard(3, Type.NUMBERED, COLOR.BLUE, 3),
    ];
    const deckState = createMockDeckState(cards); // wholeDeck conterá [cards, topDiscard]

    // Compra 2 cartas (puxa pelo final do deck: splice(-2))
    const drawn = DefaultDeckManager.draw(2, deckState);
    expect(drawn.length).toBe(2);
    expect(drawn).toContain(cards[1]);
    expect(drawn).toContain(cards[2]);
    expect(deckState.deck).toEqual([cards[0]]);
  });

  test("draw deve limitar a compra ao MAXIMUM_DRAW (20)", () => {
    // Cria 25 cartas no deck
    const cards = Array.from({ length: 25 }, (_, i) =>
      createMockCard(i, Type.NUMBERED, COLOR.RED, 1),
    );
    const deckState = createMockDeckState(cards);

    const drawn = DefaultDeckManager.draw(22, deckState);

    expect(drawn.length).toBe(20); // Limitado a 20
  });

  test("draw deve reabastecer o deck a partir de discardPile se acabar", () => {
    // Deck principal vazio, monte de descarte com 2 cartas
    const discardCard1 = createMockCard(1, Type.NUMBERED, COLOR.BLUE, 1);
    const discardCard2 = createMockCard(2, Type.NUMBERED, COLOR.BLUE, 2);

    const deckState = createMockDeckState([]);
    deckState.discardPile = [discardCard1, discardCard2];

    // Compra 1 carta. Como o deck está vazio, deve embaralhar discardPile para o deck, esvaziar discardPile e comprar
    const drawn = DefaultDeckManager.draw(1, deckState);

    expect(drawn.length).toBe(1);
    expect(deckState.discardPile.length).toBe(0);
    expect(deckState.deck.length).toBe(1); // Sobrou 1 no deck
  });

  test("shuffle deve retornar um array do mesmo tamanho e elementos reordenados", () => {
    const cards = [
      createMockCard(1, Type.NUMBERED, COLOR.BLUE, 1),
      createMockCard(2, Type.NUMBERED, COLOR.RED, 2),
      createMockCard(3, Type.NUMBERED, COLOR.GREEN, 3),
    ];

    const shuffled = DefaultDeckManager.shuffle(cards);
    expect(shuffled.length).toBe(cards.length);
    expect(shuffled).toContain(cards[0]);
    expect(shuffled).toContain(cards[1]);
    expect(shuffled).toContain(cards[2]);
  });

  test("getCardById busca a carta do wholeDeck", () => {
    const card = createMockCard(5, Type.NUMBERED, COLOR.YELLOW, 9);
    const deckState = createMockDeckState([card]);
    // wholeDeck é indexado por ID
    deckState.wholeDeck = [];
    deckState.wholeDeck[5] = card;

    expect(DefaultDeckManager.getCardById(5, deckState)).toBe(card);
  });

  test("drawUntil tira cartas até achar uma que possa ser jogada sobre a informada", () => {
    const targetCard = createMockCard(10, Type.NUMBERED, COLOR.RED, 5);

    // Cartas no deck (pop remove do fim):
    // Última carta (será pop'ed primeiro): Verde 3 (Incompatível)
    // Penúltima carta: Azul 3 (Incompatível)
    // Antepenúltima carta: Vermelho 2 (Compatível - cor bate)
    const cardComp = createMockCard(1, Type.NUMBERED, COLOR.RED, 2);
    const cardIncomp1 = createMockCard(2, Type.NUMBERED, COLOR.BLUE, 3);
    const cardIncomp2 = createMockCard(3, Type.NUMBERED, COLOR.GREEN, 3);

    const deckState = createMockDeckState([cardComp, cardIncomp1, cardIncomp2]);
    const players = [createMockPlayer(1), createMockPlayer(2)];
    const state = createMockState(players, deckState, createMockTurnState(players));

    const result = DefaultDeckManager.drawUntil(targetCard, deckState, state);

    expect(result.findOne).toBe(true);
    // Deve conter as incompatíveis e a de sucesso
    expect(result.cards).toContain(cardIncomp2);
    expect(result.cards).toContain(cardIncomp1);
    expect(result.cards).toContain(cardComp);
    expect(result.cards.length).toBe(3);
    // Sobrou nada no deck
    expect(deckState.deck.length).toBe(0);
  });

  test("drawUntil retorna findOne: false se o deck esvaziar sem achar match", () => {
    const targetCard = createMockCard(10, Type.NUMBERED, COLOR.RED, 5);
    const card1 = createMockCard(1, Type.NUMBERED, COLOR.BLUE, 3);
    const deckState = createMockDeckState([card1]);
    const players = [createMockPlayer(1), createMockPlayer(2)];
    const state = createMockState(players, deckState, createMockTurnState(players));

    const result = DefaultDeckManager.drawUntil(targetCard, deckState, state);
    expect(result.findOne).toBe(false);
    expect(result.cards).toContain(card1);
  });

  test("drawUntil deve reabastecer o deck a partir de discardPile se acabar sem achar match", () => {
    const targetCard = createMockCard(10, Type.NUMBERED, COLOR.RED, 5);
    const cardIncomp = createMockCard(1, Type.NUMBERED, COLOR.BLUE, 3);
    const cardComp = createMockCard(2, Type.NUMBERED, COLOR.RED, 2);

    const deckState = createMockDeckState([cardIncomp]);
    deckState.discardPile = [cardComp];
    const players = [createMockPlayer(1), createMockPlayer(2)];
    const state = createMockState(players, deckState, createMockTurnState(players));

    const result = DefaultDeckManager.drawUntil(targetCard, deckState, state);
    expect(result.findOne).toBe(true);
    expect(result.cards).toContain(cardIncomp);
    expect(result.cards).toContain(cardComp);
    expect(deckState.discardPile.length).toBe(0);
  });
});
