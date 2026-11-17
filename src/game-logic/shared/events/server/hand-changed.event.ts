import { DefaultPlayerState } from "../../player/default.player.state.ts";
import { DefaultServerEvent } from "./server.default.event.ts";
import { ServerEventPayloads, ServerPayload } from "./server-payloads.ts";

// playerId vai ser quem soltou o efeito, targetId vai ser quem foi escolhido (broadcast para a mesa)
export class HandChanged extends DefaultServerEvent<
  ServerPayload<"HAND_CHANGED">
> {
  constructor(
    sendedBy: DefaultPlayerState | null,
    for1: DefaultPlayerState[],
    data: ServerPayload<"HAND_CHANGED">,
  ) {
    super(ServerEventPayloads.HAND_CHANGED.commomName, sendedBy, for1, data);
  }
}
