import { EventSocket } from "../game-logic/base/event.guard.ts";
import { Player } from "../game-logic/base/player/player.state.ts";
import { ServerEventArgs } from "../game-logic/base/server.event.ts";

export class NetworkEventHandler implements EventSocket {
  handle(serverEvent: ServerEventArgs<unknown>, player: Player<any>) {
    if (player && player.network) {
      player.network.sendToPlayer(serverEvent);
    }
  }
}
