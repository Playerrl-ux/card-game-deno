import { DeckManager } from "../../../base/deck.manager.ts";
import {
  Card,
  Configs,
  DefaultDeckState,
  DefaultState,
  Type,
} from "../../cards/default.card.ts";
import { DefaultGenerator } from "../../cards/generator.ts";
import { DefaultRandomManager } from "../../utils/random.manager.ts";

const MAXIMUM_DRAW = 20;

export const DefaultDeckManager: DeckManager<Card, Configs, DefaultDeckState> =
  {
    discard(card: Card, deckState: DefaultDeckState) {
      deckState.discardPile.push(deckState.topDiscard);
      if (deckState.topDiscard.effectiveColor) {
        deckState.topDiscard.effectiveColor = undefined;
      }
      deckState.topDiscard = card;
    },

    draw(quantity: number, deckState: DefaultDeckState): Card[] {
      quantity = Math.min(quantity, MAXIMUM_DRAW);
      const drawnCards: Card[] = [];

      const fromDeck = Math.min(quantity, deckState.deck.length);
      drawnCards.push(...deckState.deck.splice(-fromDeck));

      if (drawnCards.length < quantity && deckState.discardPile.length > 0) {
        deckState.deck = this.shuffle(deckState.discardPile);
        deckState.discardPile = [];

        const remainingNeeded = quantity - drawnCards.length;
        const fromNewDeck = Math.min(remainingNeeded, deckState.deck.length);
        drawnCards.push(...deckState.deck.splice(-fromNewDeck));
      }

      return drawnCards;
    },

    shuffle(cards: Card[], state?: { seed?: number; randomManager?: any }) {
      if (state && state.randomManager) {
        return state.randomManager.shuffle(cards, state);
      }
      return DefaultRandomManager.shuffle(cards, state);
    },

    getCardById(cardId: number, deckState: DefaultDeckState) {
      return deckState.wholeDeck[cardId];
    },

    drawUntil(
      card: Card,
      deckState: DefaultDeckState,
      state: DefaultState,
    ): { cards: Card[]; findOne: boolean } {
      const cards: Card[] = [];
      let top: Card | undefined;
      while (true) {
        if (deckState.deck.length === 0) {
          if (deckState.discardPile.length > 0) {
            deckState.deck = this.shuffle(deckState.discardPile, state);
            deckState.discardPile = [];
          } else {
            return { cards, findOne: false };
          }
        }
        top = deckState.deck.pop();
        if (!top) return { cards, findOne: false };
        cards.push(top);
        if (top.canBePutOver(top, card, state)) {
          return { cards, findOne: true };
        }
      }
    },

    createDeckState(quantities, numberOfDecks, configs, state?: { seed?: number; randomManager?: any }) {
      const baseCards = DefaultGenerator.generateBaseCards(configs);
      const wholeDeck = DefaultGenerator.generateFullDecks(
        quantities,
        baseCards[0],
        0,
        numberOfDecks,
      );
      const deck = this.shuffle(wholeDeck, state);
      const firstIndex = deck.findIndex((c) => c.type === Type.NUMBERED);
      const discard = deck.splice(firstIndex, 1)[0];
      return {
        wholeDeck,
        baseCards: baseCards[0],
        deck,
        discardPile: [],
        topDiscard: discard,
      } as DefaultDeckState;
    },
  };
