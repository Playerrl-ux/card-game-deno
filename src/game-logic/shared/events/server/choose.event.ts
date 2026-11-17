import { DefaultPlayerState } from "../../player/default.player.state.ts";
import { DefaultServerEvent } from "./server.default.event.ts";
import { ServerEventPayloads, ServerPayload } from "./server-payloads.ts";

export class ChooseEvent extends DefaultServerEvent<
  ServerPayload<"CHOOSE">
> {
  constructor(
    sendedBy: DefaultPlayerState | null,
    for1: DefaultPlayerState[],
    data: ServerPayload<"CHOOSE">,
  ) {
    super(ServerEventPayloads.CHOOSE.commomName, sendedBy, for1, data);
  }
}
