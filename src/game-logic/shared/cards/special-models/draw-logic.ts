import { EventManager } from "../../../base/event.manager.ts";
import { challengeEvent } from "../../events/client/challenge.event.ts";
import { drawChoiceEvent } from "../../events/client/draw.choice.event.ts";
import { playCardEvent } from "../../events/client/play-card.event.ts";
import { CardDrawEvent } from "../../events/server/card-draw.event.ts";
import { DefaultPlayerState } from "../../player/default.player.state.ts";
import { CAN_CHANGE, Card, DefaultState } from "../default.card.ts";

export const drawLogic = async (
  card: Card,
  state: DefaultState,
  eventManager: EventManager<DefaultState>,
  player: DefaultPlayerState, // o que jogou o +2
  makeChallenge: boolean,
): Promise<CAN_CHANGE> => {
  console.log(
    `[DRAW LOGIC] Started for card ${card.name} by player ${player.id}`,
  );
  const eventsToWait: string[] = [drawChoiceEvent.name];
  const next = state.turnManager.getNext(
    player,
    state.room.turn,
  ) as DefaultPlayerState;

  // Verifica se o próximo jogador pode "rebater" com outro +2
  const playableCards = state.playerManager.checkPlayCard(
    state.room.deck.topDiscard,
    next,
    state,
  );

  if (playableCards.length === 0 && !makeChallenge) {
    const cards = state.deckManager.draw(
      state.room.currentDraw,
      state.room.deck,
    );
    state.playerManager.addCards(cards, next);
    state.room.currentDraw = 0;

    eventManager.emitToClient(
      new CardDrawEvent(
        null,
        state.room.players.filter((p) => p.id !== next.id),
        {
          playerId: next.id,
          quantity: cards.length,
          cards: [],
        },
      ),
    );

    eventManager.emitToClient(
      new CardDrawEvent(null, [next], {
        playerId: next.id,
        quantity: cards.length,
        cards,
      }),
    );

    state.turnManager.skipNext(player, state.room.turn);

    return;
  }

  if (playableCards.length > 0) {
    eventsToWait.push(playCardEvent.name);
  }
  if (makeChallenge) {
    eventsToWait.push(challengeEvent.name);
  }
  if (eventsToWait.length > 0) {
    state.eventsForNextPlayer = eventsToWait;
  }
};
