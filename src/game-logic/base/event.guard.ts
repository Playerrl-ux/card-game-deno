import { EventManager } from "./event.manager.ts";
import { Player } from "./player/player.state.ts";
import { ServerEventArgs } from "./server.event.ts";
import { State } from "./state.ts";

// nao sei se eu vou precisar disso
export interface EventSocket {
  handle: (
    serverEvent: ServerEventArgs<unknown>,
    player: Player<unknown>,
  ) => void;
}

export abstract class EventGuard {
  eventManager: EventManager<State<unknown, unknown>>;
  constructor(eventManager: EventManager<State<unknown, unknown>>) {
    this.eventManager = eventManager;
  }

  abstract guard(
    player: Player<unknown>,
    eventName: string,
    eventData: unknown,
  ): void;

  abstract requestSnapshot(player: Player<unknown>): void;

  abstract manageBotAction(botId: number, event: ServerEventArgs<unknown>): void;
}
