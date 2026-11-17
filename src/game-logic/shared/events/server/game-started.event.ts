import { DefaultPlayerState } from "../../player/default.player.state.ts";
import { DefaultServerEvent } from "./server.default.event.ts";
import { ServerEventPayloads, ServerPayload, SerializedCard } from "./server-payloads.ts";

export type { SerializedCard };
export type GameStartedData = ServerPayload<"GAME_STARTED">;

/**
 * Evento emitido no início da partida contendo a referência ao catálogo de cartas (wholeDeck),
 * a carta inicial descartada e as configurações do jogo.
 */
export class GameStartedEvent extends DefaultServerEvent<
  ServerPayload<"GAME_STARTED">
> {
  constructor(
    sendedBy: DefaultPlayerState | null,
    forPlayers: DefaultPlayerState[],
    data: ServerPayload<"GAME_STARTED">,
  ) {
    super(ServerEventPayloads.GAME_STARTED.commomName, sendedBy, forPlayers, data);
  }
}
