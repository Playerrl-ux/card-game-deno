import { EventSocket } from "../game-logic/base/event.guard.ts";
import { ServerEventArgs } from "../game-logic/base/server.event.ts";
import { Player } from "../game-logic/base/player/player.state.ts";
import { EventType } from "./network.event.ts";

export class EventSocketImpl implements EventSocket {
  handle(serverEvent: ServerEventArgs<unknown>, player: Player<unknown>): void {
    this.handleEvent("GAME", serverEvent.sendedBy, serverEvent.data);
  }

  handleEvent(
    eventType: EventType,
    sendedBy: Player<unknown>,
    data: unknown,
  ): void {}
}
