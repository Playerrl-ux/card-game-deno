import { DefaultPlayerState } from "../../player/default.player.state.ts";
import { DefaultServerEvent } from "./server.default.event.ts";
import { ServerEventPayloads, ServerPayload } from "./server-payloads.ts";

export class GameSnapshotEvent extends DefaultServerEvent<
  ServerPayload<"GAME_SNAPSHOT">
> {
  constructor(
    sendedBy: DefaultPlayerState | null,
    forPlayers: DefaultPlayerState[],
    data: ServerPayload<"GAME_SNAPSHOT">,
  ) {
    super(ServerEventPayloads.GAME_SNAPSHOT.commomName, sendedBy, forPlayers, data);
  }
}
