import { DefaultPlayerState } from "../../player/default.player.state.ts";
import { DefaultServerEvent } from "./server.default.event.ts";
import { ServerEventPayloads, ServerPayload } from "./server-payloads.ts";

export class ChangeDirectionEvent extends DefaultServerEvent<
  ServerPayload<"DIRECTION">
> {
  constructor(
    sendedBy: DefaultPlayerState | null,
    for1: DefaultPlayerState[],
    data: ServerPayload<"DIRECTION">,
  ) {
    super(ServerEventPayloads.DIRECTION.commomName, sendedBy, for1, data);
  }
}
