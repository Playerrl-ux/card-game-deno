import { EventManager } from "../../../base/event.manager.ts";
import { DefaultPlayerState } from "../../player/default.player.state.ts";
import {
  baseCanBePutOver,
  Card,
  COLOR,
  Configs,
  DefaulEffect,
  DefaultState,
  Type,
} from "../default.card.ts";
import { drawLogic } from "./draw-logic.ts";

export const draw2EffectBefore: DefaulEffect = function (
  _card: Card,
  state: DefaultState,
  _eventManager: EventManager<DefaultState>,
  _player: DefaultPlayerState,
) {
  state.room.currentDraw += 2;
  return undefined;
};

export const draw2EffectAfter: DefaulEffect = function (
  card: Card,
  state: DefaultState,
  eventManager: EventManager<DefaultState>,
  player: DefaultPlayerState,
) {
  return drawLogic(card, state, eventManager, player, false);
};

// Um +2 nao pode ser colocado em cima de um +4 de cor diferente mesmo se a configuracao DRAW_2_OVER_DRAW_4 estiver ligada
export const draw2CanBePutOver = (configs: Configs) => {
  if (configs.DRAW_2_OVER_DRAW_4) {
    return (current: Card, target: Card, state: DefaultState) => {
      if (state.room.currentDraw > 0) {
        const targetColor = target.effectiveColor || target.color;
        const currentColor = current.effectiveColor || current.color;
        return (
          target.type === current.type ||
          (target.type === Type.DRAW_4 && targetColor === currentColor)
        );
      }
      return baseCanBePutOver(current, target, state);
    };
  }
  return (current: Card, target: Card, state: DefaultState) => {
    if (state.room.currentDraw > 0) {
      return target.type === current.type;
    }
    return baseCanBePutOver(current, target, state);
  };
};

export const createDraw2 = (
  configs: Configs,
  id: number,
  color: COLOR,
  name: string,
) => {
  return {
    id,
    name,
    value: undefined,
    color,
    effectiveColor: color,
    type: Type.DRAW_2,
    effectBefore: draw2EffectBefore,
    effectAfter: draw2EffectAfter,
    canBePutOver: draw2CanBePutOver(configs),
  } as Card;
};
