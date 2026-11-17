import { DefaultPlayerState } from "../../player/default.player.state.ts";
import { CardDrawEvent } from "../server/card-draw.event.ts";
import { ChooseEvent } from "../server/choose.event.ts";
import { DefaultClientEvent } from "./client.default.event.ts";
import { playCardEvent } from "./play-card.event.ts";
import { Card, DefaultState } from "../../cards/default.card.ts";
import { EventManager } from "../../../base/event.manager.ts";
import { serializeCard } from "../../utils/card.utils.ts";
import { ClientEventPayloads, ClientPayload } from "./client-payloads.ts";

export interface KeepEvent extends DefaultClientEvent<ClientPayload<"KEEP_EVENT">> {}

// isso de esperar por um evento que nao vai fazer nada so pra continuar a execucao de outro talvez esteja uma merda
// nao vejo outras alternativas entretanto
export const keepEvent: KeepEvent = {
  name: ClientEventPayloads.KEEP_EVENT.commomName,
  dataSchema: ClientEventPayloads.KEEP_EVENT.dataStructure,

  action: async (
    _state: DefaultState,
    _eventManager: EventManager<DefaultState>,
    _data: ClientPayload<"KEEP_EVENT">,
    _player: DefaultPlayerState,
  ) => {},
};

export interface DrawChoiceEvent extends DefaultClientEvent<ClientPayload<"DRAW_CHOICE">> {}

export const drawChoiceEvent: DrawChoiceEvent = {
  name: ClientEventPayloads.DRAW_CHOICE.commomName,
  dataSchema: ClientEventPayloads.DRAW_CHOICE.dataStructure,
  action: async (
    state: DefaultState,
    eventManager: EventManager<DefaultState>,
    _data: ClientPayload<"DRAW_CHOICE">,
    player: DefaultPlayerState,
  ) => {
    // a cadeia de compra esta ativa
    if (state.room.currentDraw !== 0) {
      const cards = state.deckManager.draw(
        state.room.currentDraw,
        state.room.deck,
      );
      state.playerManager.addCards(cards, player);
      eventManager.emitToClient(
        new CardDrawEvent(null, [player], {
          playerId: player.id,
          quantity: cards.length,
          cards: cards.map(serializeCard),
        }),
      );
      eventManager.emitToClient(
        new CardDrawEvent(
          null,
          state.room.players.filter((p) => p.id !== player.id),
          {
            playerId: player.id,
            quantity: cards.length,
            cards: [],
          },
        ),
      );
      state.room.currentDraw = 0;

      if (!state.victoryTriggered) {
        state.turnManager.setupNextPlayerTurn(state.room.turn);
        eventManager.changeTurn();
      }

      // caso o player decida comprar sem estar na cadeia de compra
    } else {
      let cards: Card[];
      let findOne = false;
      if (state.configs.DRAW_UNTIL_HAVE) {
        const result = state.deckManager.drawUntil(
          state.room.deck.topDiscard,
          state.room.deck,
          state,
        );
        state.playerManager.addCards(result.cards, player);
        findOne = result.findOne;
        cards = result.cards;
      } else {
        cards = state.deckManager.draw(1, state.room.deck);
        state.playerManager.addCards(cards, player);
        const playable = state.playerManager.checkPlayCard(
          state.room.deck.topDiscard,
          player,
          state,
        );
        findOne = playable.some((p) => p.id === cards[0].id);
      }
      eventManager.emitToClient(
        new CardDrawEvent(null, [player], {
          playerId: player.id,
          quantity: cards.length,
          cards: cards.map(serializeCard),
        }),
      );
      eventManager.emitToClient(
        new CardDrawEvent(
          null,
          state.room.players.filter((p) => p.id !== player.id),
          {
            playerId: player.id,
            quantity: cards.length,
            cards: [],
          },
        ),
      );
      if (findOne) {
        eventManager.emitToClient(
          new ChooseEvent(player, [player], { playerId: player.id }),
        );

        const playable = state.playerManager.checkPlayCard(
          state.room.deck.topDiscard,
          player,
          state,
        );
        const playableDrawnCards = cards.filter((c) =>
          playable.some((p) => p.id === c.id),
        );
        const data = await eventManager.waitForEvent(
          [playCardEvent.name, keepEvent.name],
          3000,
          [player],
          playableDrawnCards.map(serializeCard),
          (state, eventManager) => {
            state.turnManager.setupNextPlayerTurn(state.room.turn);
            eventManager.changeTurn();
          },
          {
            action: drawChoiceEvent.name,
            cardId: playableDrawnCards[0]?.id,
          },
        );

        if (data.eventReturned === keepEvent.name) {
          state.turnManager.setupNextPlayerTurn(state.room.turn);
          eventManager.changeTurn();
        }
        return;
      }
      state.turnManager.setupNextPlayerTurn(state.room.turn);
      eventManager.changeTurn();
    }
  },
};

export type Draw2OptionsData = ClientPayload<"DRAW_CHOICE">;
