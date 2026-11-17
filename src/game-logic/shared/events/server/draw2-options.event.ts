import { DefaultPlayerState } from "../../player/default.player.state.ts";
import { DefaultServerEvent } from "./server.default.event.ts";
import { ServerEventPayloads, ServerPayload } from "./server-payloads.ts";

export class Draw2Options extends DefaultServerEvent<
  ServerPayload<"DRAW2_OPTIONS">
> {
  constructor(
    sendedBy: DefaultPlayerState | null,
    for1: DefaultPlayerState[],
    data: ServerPayload<"DRAW2_OPTIONS">,
  ) {
    super(ServerEventPayloads.DRAW2_OPTIONS.commomName, sendedBy, for1, data);
  }
}
