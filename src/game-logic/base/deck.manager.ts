import { CardQuantities } from "./card.ts";
import { DeckState } from "./state.ts";

const MAXIMUM_DRAW = 20;

export interface DeckManager<C, CO, S extends DeckState<C>> {
  discard(card: C, deckState: S): void;

  draw(quantity: number, deckState: S): C[];

  shuffle(cards: C[], state?: { seed?: number; randomManager?: any }): C[];

  getCardById(cardId: number, deckState: S): C | undefined;

  drawUntil(
    card: C,
    deckState: S,
    state: unknown,
  ): { cards: C[]; findOne: boolean };

  createDeckState(
    quantities: CardQuantities,
    numberOfDecks: number,
    configs: CO,
    state?: { seed?: number; randomManager?: any },
  ): S;
}
