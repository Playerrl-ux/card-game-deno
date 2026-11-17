import { DefaultState, Type } from "../../cards/default.card.ts";
import { DefaultPlayerState } from "../../player/default.player.state.ts";
import { CardDrawEvent } from "../server/card-draw.event.ts";
import { ChanllengeResult } from "../server/challenge-result.event.ts";
import { ShowHandEvent } from "../server/show-hand.event.ts";
import {
  ServerEventPayloads,
  ServerPayload,
} from "../server/server-payloads.ts";
import { serializeCard } from "../../utils/card.utils.ts";
import { VoidServerEvent } from "../server/void.events.ts";
import { DefaultClientEvent } from "./client.default.event.ts";
import { EventManager } from "../../../base/event.manager.ts";
import { ClientEventPayloads, ClientPayload } from "./client-payloads.ts";

export interface ChallengeEvent extends DefaultClientEvent<
  ClientPayload<"CHALLENGE">
> {}

export const challengeEvent: ChallengeEvent = {
  name: ClientEventPayloads.CHALLENGE.commomName,
  dataSchema: ClientEventPayloads.CHALLENGE.dataStructure,
  action: async (
    state: DefaultState,
    eventManager: EventManager<DefaultState>,
    data: ClientPayload<"CHALLENGE">,
    player: DefaultPlayerState,
  ) => {
    const discardLength = state.room.deck.discardPile.length;
    // o top discard ainda nao faz parte do descarte,
    // entao a carta anterior e a ultima do array de descarte
    const previousCard = state.room.deck.discardPile[discardLength - 1];
    const previousPlayer = state.turnManager.getPrevious(
      player,
      state.room.turn,
    );
    // necessario para que o checkPlayCard possa verificar quais cartas o jogador podia ter jogado anteriormente
    const checkState =
      state.room.currentDraw > 0
        ? ({
            ...state,
            // se o +4 tiver sido jogado dentro de uma cadeia de compra,
            // envia para o checkPlayCard a contagem de compra anterior
            room: { ...state.room, currentDraw: state.room.currentDraw - 4 },
          } as DefaultState)
        : state;

    const cards = state.playerManager.checkPlayCard(
      previousCard,
      previousPlayer,
      checkState,
    );

    let drawQuantity: number;
    let playerToDraw: DefaultPlayerState;
    let playerThatWon: DefaultPlayerState;
    let won = true;

    // sinalizando para os players qual foi a opcao escolhida pelo outro jogador
    eventManager.emitToClient(
      new VoidServerEvent<ServerPayload<"CHALLENGE">>(
        ServerEventPayloads.CHALLENGE.broadcastName,
        player,
        state.room.players,
        data,
      ),
    );

    const options = cards.filter((c) => c.type !== Type.DRAW_4);
    if (options.length === 0) {
      drawQuantity = state.room.currentDraw + 2;
      playerToDraw = player;
      playerThatWon = previousPlayer;

      eventManager.emitToClient(
        new ChanllengeResult(null, state.room.players, {
          playerId: player.id,
          challengeResult: false,
        }),
      );
      // state.stateManager.setupNextPlayer(
      //   state.turnManager.getNext(player, state.room.turn),
      //   state
      // );
    } else {
      drawQuantity = state.room.currentDraw;
      playerToDraw = previousPlayer;
      playerThatWon = player;
      won = false;

      eventManager.emitToClient(
        new ChanllengeResult(null, state.room.players, {
          playerId: player.id,
          challengeResult: true,
        }),
      );
      // const next = state.turnManager.getNext(player, state.room.turn);
      // Eu so preparo o turno para ser mudado para o player novamente
      state.stateManager.setupNextPlayer(player, state);
    }

    eventManager.emitToClient(
      new ShowHandEvent(null, [player], {
        playerId: previousPlayer.id,
        cards: previousPlayer.hand.map(serializeCard),
      }),
    );

    const drawCards = state.deckManager.draw(drawQuantity, state.room.deck);
    state.playerManager.addCards(drawCards, playerToDraw);
    state.room.currentDraw = 0;

    eventManager.emitToClient(
      new CardDrawEvent(null, [playerToDraw], {
        playerId: playerToDraw.id,
        quantity: drawCards.length,
        cards: drawCards.map(serializeCard),
      }),
    );

    eventManager.emitToClient(
      new CardDrawEvent(
        null,
        state.room.players.filter((p) => p !== playerToDraw),
        {
          playerId: playerToDraw.id,
          quantity: drawCards.length,
          cards: [],
        },
      ),
    );

    eventManager.tryChange();
  },
};
