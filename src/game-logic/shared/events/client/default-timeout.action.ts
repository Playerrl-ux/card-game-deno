import { Card, DefaultState } from "../../cards/default.card.ts";
import { EventManager } from "../../../base/event.manager.ts";
import { DefaultPlayerState } from "../../player/default.player.state.ts";
import { CardDrawEvent } from "../server/card-draw.event.ts";
import { serializeCard } from "../../utils/card.utils.ts";
import { ActionSignature } from "../../../base/client.event.ts";

/**
 * Ação padrão executada quando ocorre um timeout no turno de um jogador:
 * Comprar cartas para o jogador até que ele tenha uma carta jogável (ou compra acumulada)
 * e passa o seu turno.
 */
export const defaultTimeoutAction: ActionSignature<
  unknown,
  Promise<void> | void,
  Card,
  DefaultState
> = async (
  state: DefaultState,
  eventManager: EventManager<DefaultState>,
  _data: unknown,
  player: DefaultPlayerState,
): Promise<void> => {
  const targetPlayer = player ?? state.room.turn.currentPlayer.value;

  // 1. Se estiver na cadeia de compra (+2 ou +4 acumulado)
  if (state.room.currentDraw !== 0) {
    const cards = state.deckManager.draw(
      state.room.currentDraw,
      state.room.deck,
    );
    state.playerManager.addCards(cards, targetPlayer);
    eventManager.emitToClient(
      new CardDrawEvent(null, [targetPlayer], {
        playerId: targetPlayer.id,
        quantity: cards.length,
        cards: cards.map(serializeCard),
      }),
    );
    eventManager.emitToClient(
      new CardDrawEvent(
        null,
        state.room.players.filter((p) => p.id !== targetPlayer.id),
        {
          playerId: targetPlayer.id,
          quantity: cards.length,
          cards: [],
        },
      ),
    );
    state.room.currentDraw = 0;
  } else {
    // 2. Compra cartas para o jogador (até ter uma jogável se DRAW_UNTIL_HAVE, ou apenas 1 carta)
    let cards: Card[];
    if (state.configs.DRAW_UNTIL_HAVE) {
      const result = state.deckManager.drawUntil(
        state.room.deck.topDiscard,
        state.room.deck,
        state,
      );
      cards = result.cards;
    } else {
      cards = state.deckManager.draw(1, state.room.deck);
    }
    state.playerManager.addCards(cards, targetPlayer);

    eventManager.emitToClient(
      new CardDrawEvent(null, [targetPlayer], {
        playerId: targetPlayer.id,
        quantity: cards.length,
        cards: cards.map(serializeCard),
      }),
    );
    eventManager.emitToClient(
      new CardDrawEvent(
        null,
        state.room.players.filter((p) => p.id !== targetPlayer.id),
        {
          playerId: targetPlayer.id,
          quantity: cards.length,
          cards: [],
        },
      ),
    );
  }

  // Passa o turno do jogador
  state.turnManager.setupNextPlayerTurn(state.room.turn);
  eventManager.changeTurn();
};
