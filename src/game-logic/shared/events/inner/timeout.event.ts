import { Player } from "../../../base/player/player.state.ts";
import { EventManager } from "../../../base/event.manager.ts";
import { DefaultState } from "../../cards/default.card.ts";
import { DefautlEventManager } from "../event.manager.ts";
import { drawChoiceEvent } from "../client/draw.choice.event.ts";
import { DefaultPlayerState } from "../../player/default.player.state.ts";

const defaultAction = (
  _state: DefaultState,
  _eventManager: DefautlEventManager,
) => {};

export const timeoutName = "TIMEOUT";

export class TimeoutEvent {
  name: string = timeoutName;
  timeout: number;
  players: DefaultPlayerState[];
  action: (state: DefaultState, eventManager: DefautlEventManager) => void;

  // player representa o player cujo turno deu timeout, ele sera nulo se a acao puder ser feita
  // por multiplos players, como no caso de um jumpin
  constructor(
    timeout: number,
    players: DefaultPlayerState[],
    action?: (state: DefaultState, eventManager: DefautlEventManager) => void,
  ) {
    this.timeout = timeout;
    this.players = players;
    this.action = action ?? defaultAction;
  }
}
