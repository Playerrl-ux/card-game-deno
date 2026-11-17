import { DefaultPlayerState } from "../../player/default.player.state.ts";
import { timeoutName } from "../inner/timeout.event.ts";
import { VoidServerEvent } from "../server/void.events.ts";
import { DefaultClientEvent } from "./client.default.event.ts";
import { jumpInEvent } from "./jumpin.event.ts";
import { checkVictory } from "../../cards/victory.ts";
import { DEFAULT_EVENTS } from "../default-events.ts";
import { CAN_CHANGE, DefaultState } from "../../cards/default.card.ts";
import { EventManager } from "../../../base/event.manager.ts";
import {
  SerializedCard,
  ServerEventPayloads,
  ServerPayload,
} from "../server/server-payloads.ts";
import { serializeCard } from "../../utils/card.utils.ts";
import { ClientEventPayloads, ClientPayload } from "./client-payloads.ts";
import { unoEvent } from "./uno.event.ts";
import { CardDrawEvent } from "../server/card-draw.event.ts";

export interface PlayCardEvent extends DefaultClientEvent<
  ClientPayload<"PLAY_CARD">
> {}

// Se eu nao tivesse usado o await aqui, eu teria que escrever uma funcao auxiliar com 3 fluxos diferentes de ifs
// ou then para ela ser executada
export const playCardEvent: PlayCardEvent = {
  name: ClientEventPayloads.PLAY_CARD.commomName,
  dataSchema: ClientEventPayloads.PLAY_CARD.dataStructure,
  validateData(
    state: DefaultState,
    _eventManager: EventManager<DefaultState>,
    data: ClientPayload<"PLAY_CARD">,
    player: DefaultPlayerState,
  ) {
    const card = state.playerManager.getCard(data.cardId, player);
    if (!card) {
      // adicioanr um log aqui ou pensar num jeito de retornar uma mensagem para o cliente
      return false;
    }
    if (!card.canBePutOver(card, state.room.deck.topDiscard, state)) {
      // adicioanr um log aqui ou pensar num jeito de retornar uma mensagem para o cliente
      return false;
    }
    return true;
  },
  action: async (
    state: DefaultState,
    eventManager: EventManager<DefaultState>,
    data: ClientPayload<"PLAY_CARD">,
    player: DefaultPlayerState,
  ) => {
    const card = state.playerManager.play(data.cardId, player);
    if (!card) return;
    let depData;
    state.deckManager.discard(card, state.room.deck);

    eventManager.emitToClient(
      new VoidServerEvent<ServerPayload<"PLAY_CARD">>(
        ServerEventPayloads.PLAY_CARD.broadcastName,
        player,
        state.room.players,
        {
          card: serializeCard(card),
          saidUno: data.saidUno,
        },
      ),
    );
    if (!data.saidUno && player.hand.length === 1) {
      const unoResult = await eventManager.waitForEvent(
        [unoEvent.name],
        ServerEventPayloads.UNO.timeout,
        state.room.players,
        [],
        undefined,
        { action: "UNO" },
      );

      if (unoResult?.eventReturned === unoEvent.name) {
        const callerId =
          unoResult.player?.id ?? (unoResult.data as any)?.playerId;
        if (callerId !== undefined && callerId !== player.id) {
          const penaltyCards = state.deckManager.draw(2, state.room.deck);
          state.playerManager.addCards(penaltyCards, player);
          eventManager.emitToClient(
            new CardDrawEvent(null, [player], {
              playerId: player.id,
              quantity: penaltyCards.length,
              cards: penaltyCards.map(serializeCard),
            }),
          );
          eventManager.emitToClient(
            new CardDrawEvent(
              null,
              state.room.players.filter((p) => p.id !== player.id),
              {
                playerId: player.id,
                quantity: penaltyCards.length,
                cards: [],
              },
            ),
          );
        }
      }
    }

    state.eventsForNextPlayer = DEFAULT_EVENTS;

    await card.effectBefore(card, state, eventManager, player);

    const won = await checkVictory(state, eventManager, player);
    if (won) return;

    const jumpInCards: SerializedCard[] = [];
    if (state.configs.JUMPIN) {
      for (const p of state.room.players) {
        for (const c of p.hand) {
          if (c.name === card.name) {
            jumpInCards.push(serializeCard(c));
          }
        }
      }
    }
    const isJumpinPossible = jumpInCards.length > 0;

    if (isJumpinPossible) {
      depData = await eventManager.waitForEvent(
        [jumpInEvent.name],
        ServerEventPayloads.JUMP_IN.timeout,
        state.room.players,
        jumpInCards,
      );
    }

    if (!isJumpinPossible || depData?.eventReturned === timeoutName) {
      const effectResult = await card.effectAfter(
        card,
        state,
        eventManager,
        player,
      );
      if (effectResult !== CAN_CHANGE.NO) {
        eventManager.tryChange();
      }
    }
  },
};

export type PlayCardType = ClientPayload<"PLAY_CARD">;
