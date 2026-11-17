import { DefaultPlayerState } from "../../player/default.player.state.ts";
import { DefaultClientEvent } from "./client.default.event.ts";
import { VoidServerEvent } from "../server/void.events.ts";
import { checkVictory } from "../../cards/victory.ts";
import { DEFAULT_EVENTS } from "../default-events.ts";
import { CAN_CHANGE, Card, DefaultState } from "../../cards/default.card.ts";
import { EventManager } from "../../../base/event.manager.ts";
import {
  ServerEventPayloads,
  ServerPayload,
} from "../server/server-payloads.ts";
import { serializeCard } from "../../utils/card.utils.ts";
import { ClientEventPayloads, ClientPayload } from "./client-payloads.ts";

export interface JumpInEvent extends DefaultClientEvent<
  ClientPayload<"JUMP_IN">
> {}

export const jumpInEvent: JumpInEvent = {
  name: ClientEventPayloads.JUMP_IN.commomName,
  dataSchema: ClientEventPayloads.JUMP_IN.dataStructure,
  validateData: (
    state: DefaultState,
    _eventManager: EventManager<DefaultState>,
    data: ClientPayload<"JUMP_IN">,
    player: DefaultPlayerState,
  ) => {
    const topDiscard = state.room.deck.topDiscard;
    if (topDiscard.id !== data.targetId) {
      return false;
    }

    const target = state.room.deck.topDiscard;
    const cardJumpedIn = state.deckManager.getCardById(
      data.cardJumpedId,
      state.room.deck,
    );
    if (!target) {
      return false;
    }

    if (!cardJumpedIn) {
      return false;
    }

    if (target.name !== cardJumpedIn.name) {
      return false;
    }

    const playerHasCard = player.hand.some((c) => c.id === data.cardJumpedId);
    if (!playerHasCard) {
      return false;
    }

    return true;
  },
  action: async (
    state: DefaultState,
    eventManager: EventManager<DefaultState>,
    data: ClientPayload<"JUMP_IN">,
    player: DefaultPlayerState,
  ) => {
    const target = state.room.deck.topDiscard;
    const cardJumpedIn = state.deckManager.getCardById(
      data.cardJumpedId,
      state.room.deck,
    ) as Card;

    const card = state.playerManager.play(data.cardJumpedId, player);
    if (!card) return;
    state.deckManager.discard(card, state.room.deck);
    eventManager.emitToClient(
      new VoidServerEvent<ServerPayload<"JUMP_IN">>(
        ServerEventPayloads.JUMP_IN.broadcastName,
        player,
        state.room.players,
        {
          target: serializeCard(target),
          cardJumpedIn: serializeCard(cardJumpedIn),
        },
      ),
    );

    // O turno e modificado mas nao e notificado para os clientes.
    // Isso pode ser um problema mais tarde, mas para agora funcioina.
    // Estou fazendo isso aqui para que os efeitos a serem executados fiquem cientes de quem e o turno
    state.turnManager.setupCurrentPlayerTurn(player, state.room.turn);
    state.eventsForNextPlayer = DEFAULT_EVENTS;

    // Os dois efeitos vao ser executados nesse caso
    await card.effectBefore(card, state, eventManager, player);
    const won = await checkVictory(state, eventManager, player);
    if (won) return;
    const effectResult = await card.effectAfter(
      card,
      state,
      eventManager,
      player,
    );
    if (effectResult !== CAN_CHANGE.NO) {
      console.log(
        `[TRACE] jumpinEvent (cardId=${card.id}): calling tryChange()`,
      );
      eventManager.tryChange();
    }
  },
};

export type JumpInData = ClientPayload<"JUMP_IN">;
