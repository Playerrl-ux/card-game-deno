import { DefaultPlayerState } from "../../player/default.player.state.ts";
import { DefaultServerEvent } from "./server.default.event.ts";
import { ServerEventPayloads, ServerPayload } from "./server-payloads.ts";

export class CardDrawEvent extends DefaultServerEvent<
  ServerPayload<"CARD_DRAW">
> {
  constructor(
    sendedBy: DefaultPlayerState | null,
    for1: DefaultPlayerState[],
    data: ServerPayload<"CARD_DRAW">,
  ) {
    super(ServerEventPayloads.CARD_DRAW.commomName, sendedBy, for1, data);
  }
}
