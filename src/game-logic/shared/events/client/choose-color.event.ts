import { DefaultPlayerState } from "../../player/default.player.state.ts";
import { DefaultState } from "../../cards/default.card.ts";
import { DefaultClientEvent } from "./client.default.event.ts";
import { EventManager } from "../../../base/event.manager.ts";
import { DEFAULT_EVENTS } from "../default-events.ts";
import { ClientEventPayloads, ClientPayload } from "./client-payloads.ts";

export interface ChooseColor extends DefaultClientEvent<ClientPayload<"CHOOSE_COLOR">> {}

export const chooseColor: ChooseColor = {
  name: ClientEventPayloads.CHOOSE_COLOR.commomName,
  dataSchema: ClientEventPayloads.CHOOSE_COLOR.dataStructure,
  action: async (
    _state: DefaultState,
    _eventManager: EventManager<DefaultState>,
    _data: ClientPayload<"CHOOSE_COLOR">,
    _player: DefaultPlayerState,
  ) => {
    // state.eventsForNextPlayer = DEFAULT_EVENTS;
  },
};
