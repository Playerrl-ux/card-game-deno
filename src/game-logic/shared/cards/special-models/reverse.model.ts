import { ChangeDirectionEvent } from "../../events/server/change-direction.event.ts";
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

export const revertEffect: DefaulEffect = (
  _card: Card,
  state: DefaultState,
  eventManager: EventManager<DefaultState>,
  player: DefaultPlayerState,
) => {
  state.turnManager.changeDirection(state.room.turn);
  eventManager.emitToClient(
    new ChangeDirectionEvent(player, state.room.players, {
      direction: state.room.turn.direction.toString(),
    }),
  );
};

export const createReverse = (id: number, color: COLOR, name: string) => {
  return {
    id,
    name,
    value: undefined,
    color,
    effectiveColor: color,
    type: Type.REVERSE,
    effectBefore: revertEffect,
    effectAfter: () => {},
    canBePutOver: baseCanBePutOver,
  } as Card;
};
