import { DefaultPlayerState } from "../../player/default.player.state.ts";
import { DefaultServerEvent } from "./server.default.event.ts";

// fazer um evento que vai servir somente para dar continuidade a efeitos, como o efeito do 7
// esse evento tambem vai servir para confirmar que outros eventos aconteceram para os jogadores, como a escolha
// de com qual player trocar a mao, a escolha da cor numa carta coringa, etc

export class VoidServerEvent<T> extends DefaultServerEvent<T> {
  constructor(
    name: string,
    sendedBy: DefaultPlayerState | null,
    for1: DefaultPlayerState[],
    data: T,
  ) {
    super(name, sendedBy, for1, data);
  }
}
