import { DefaultPlayerState } from "../../player/default.player.state.ts";
import { DefaultClientEvent } from "./client.default.event.ts";
import { VoidServerEvent } from "../server/void.events.ts";
import { DefaultState } from "../../cards/default.card.ts";
import { EventManager } from "../../../base/event.manager.ts";
import {
  ServerEventPayloads,
  ServerPayload,
} from "../server/server-payloads.ts";
import { ClientEventPayloads, ClientPayload } from "./client-payloads.ts";

export interface UnoEvent extends DefaultClientEvent<ClientPayload<"UNO">> {}

export const unoEvent: UnoEvent = {
  name: ClientEventPayloads.UNO.commomName,
  dataSchema: ClientEventPayloads.UNO.dataStructure,
  action: async (
    state: DefaultState,
    eventManager: EventManager<DefaultState>,
    _data: ClientPayload<"UNO">,
    player: DefaultPlayerState,
  ) => {
    eventManager.emitToClient(
      new VoidServerEvent<ServerPayload<"UNO">>(
        ServerEventPayloads.UNO.broadcastName,
        player,
        state.room.players,
        {
          playerId: player.id,
        },
      ),
    );
  },
};
