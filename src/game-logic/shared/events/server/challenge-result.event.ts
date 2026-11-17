import { DefaultPlayerState } from "../../player/default.player.state.ts";
import { DefaultServerEvent } from "./server.default.event.ts";
import { ServerEventPayloads, ServerPayload } from "./server-payloads.ts";

export class ChanllengeResult extends DefaultServerEvent<
  ServerPayload<"CHALLENGE_RESULT">
> {
  constructor(
    sendedBy: DefaultPlayerState | null,
    for1: DefaultPlayerState[],
    data: ServerPayload<"CHALLENGE_RESULT">,
  ) {
    super(ServerEventPayloads.CHALLENGE_RESULT.commomName, sendedBy, for1, data);
  }
}
