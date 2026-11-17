import { EventManager } from "../../../base/event.manager.ts";
import { DefaultPlayerState } from "../../player/default.player.state.ts";
import {
  baseCanBePutOver,
  Card,
  COLOR,
  DefaulEffect,
  DefaultState,
  Type,
} from "../default.card.ts";

export const blockEffect: DefaulEffect = (
  _card: Card,
  state: DefaultState,
  _eventManager: EventManager<DefaultState>,
  player: DefaultPlayerState,
) => {
  state.turnManager.skipNext(player, state.room.turn);
};

export const createBlock = (id: number, color: COLOR, name: string) => {
  return {
    id,
    name,
    value: undefined,
    color,
    effectiveColor: color,
    type: Type.BLOCK,
    effectBefore: () => {},
    effectAfter: blockEffect,
    canBePutOver: baseCanBePutOver,
  } as Card;
};
