import { DefaultPlayerState } from "../../player/default.player.state.ts";
import { DefaultServerEvent } from "./server.default.event.ts";
import { ServerEventPayloads, ServerPayload } from "./server-payloads.ts";

export class TimeoutToPlayer extends DefaultServerEvent<
  ServerPayload<"TIMEOUT_TO_PLAYER">
> {
  constructor(
    for1: DefaultPlayerState[],
    data: ServerPayload<"TIMEOUT_TO_PLAYER">,
  ) {
    super(ServerEventPayloads.TIMEOUT_TO_PLAYER.commomName, null, for1, data);
  }
}
