import { DefaultPlayerState } from "../../player/default.player.state.ts";
import { DefaultServerEvent } from "./server.default.event.ts";
import { ServerEventPayloads, ServerPayload } from "./server-payloads.ts";

// tenho que ver se a classe Card e serializavel
export class ShowHandEvent extends DefaultServerEvent<
  ServerPayload<"SHOW_HAND">
> {
  constructor(
    sendedBy: DefaultPlayerState | null,
    for1: DefaultPlayerState[],
    data: ServerPayload<"SHOW_HAND">,
  ) {
    super(ServerEventPayloads.SHOW_HAND.commomName, sendedBy, for1, data);
  }
}
