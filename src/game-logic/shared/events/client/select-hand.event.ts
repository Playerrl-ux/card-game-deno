import { DefaultPlayerState } from "../../player/default.player.state.ts";
import { DefaultState } from "../../cards/default.card.ts";
import { DefaultClientEvent } from "./client.default.event.ts";
import { EventManager } from "../../../base/event.manager.ts";
import { DEFAULT_EVENTS } from "../default-events.ts";
import { ClientEventPayloads, ClientPayload } from "./client-payloads.ts";

export interface SelectHandEvent extends DefaultClientEvent<ClientPayload<"SELECT_HAND">> {}

export const selectHandEvent: SelectHandEvent = {
  name: ClientEventPayloads.SELECT_HAND.commomName,
  dataSchema: ClientEventPayloads.SELECT_HAND.dataStructure,
  validateData(state, _eventManager, data: ClientPayload<"SELECT_HAND">, _player) {
    const currentPlayer = state.turnManager.getCurrent(state.room.turn);
    if (!currentPlayer) return false;
    return currentPlayer.id !== data.targetId;
  },
  action: async function (
    state: DefaultState,
    _eventManager: EventManager<DefaultState>,
    _data: ClientPayload<"SELECT_HAND">,
    _player: DefaultPlayerState,
  ) {
    // state.eventsForNextPlayer = DEFAULT_EVENTS;
  },
};
