import { DefaultPlayerState } from "../../player/default.player.state.ts";
import { DefaultServerEvent } from "./server.default.event.ts";
import { ServerEventPayloads, ServerPayload } from "./server-payloads.ts";

export class NewHandEvent extends DefaultServerEvent<
  ServerPayload<"NEW_HAND">
> {
  constructor(
    sendedBy: DefaultPlayerState | null,
    for1: DefaultPlayerState[],
    data: ServerPayload<"NEW_HAND">,
  ) {
    super(ServerEventPayloads.NEW_HAND.commomName, sendedBy, for1, data);
  }
}
