import { PlayerManager } from "../../base/player/player.manager.ts";
import { Card, DefaultState } from "../cards/default.card.ts";
import { DefaultPlayerState } from "./default.player.state.ts";

export const DefaultPlayerManager: PlayerManager<Card, DefaultState> = {
  getCard(id: number, player: DefaultPlayerState): Card | undefined {
    return player.hand.find((c) => c.id === id);
  },

  play(id: number, player: DefaultPlayerState): Card | undefined {
    const index = player.hand.findIndex((c) => c.id === id);
    if (index === -1) {
      return undefined;
    }
    const [card] = player.hand.splice(index, 1);
    return card;
  },

  addCards(cards: Card[], player: DefaultPlayerState): void {
    player.hand.push(...cards);
  },

  checkPlayCard(
    discardTop: Card,
    player: DefaultPlayerState,
    state: DefaultState,
  ): Card[] {
    return player.hand.filter((card) =>
      card.canBePutOver(card, discardTop, state),
    );
  },
};
