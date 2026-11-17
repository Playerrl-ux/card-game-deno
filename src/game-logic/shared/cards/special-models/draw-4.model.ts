import { EventManager } from "../../../base/event.manager.ts";
import { DefaultPlayerState } from "../../player/default.player.state.ts";
import {
  Card,
  COLOR,
  DefaulEffect,
  DefaultState,
  Type,
} from "../default.card.ts";
import { drawLogic } from "./draw-logic.ts";
import { wildEffect } from "./wild-card.model.ts";

export const draw4BeforeEffect: DefaulEffect = (
  _card: Card,
  state: DefaultState,
  _eventManager: EventManager<DefaultState>,
  _player: DefaultPlayerState,
) => {
  state.room.currentDraw += 4;
};

export const draw4AfterEffect: DefaulEffect = async (
  card: Card,
  state: DefaultState,
  eventManager: EventManager<DefaultState>,
  player: DefaultPlayerState,
) => {
  await wildEffect(card, state, eventManager, player);
  const areChallengesAllowed = state.configs.DRAW_4_CHALLENGES;
  return drawLogic(card, state, eventManager, player, areChallengesAllowed);
};

export const draw4CanBePutOver = (
  _current: Card,
  _target: Card,
  _state: DefaultState,
) => {
  // o mais 4 pode ser jogado em cima de qualquer coisa dado que nao existe uma configuracao que negue jogar um +4 em cima de um +2
  return true;
};

export const createDraw4 = (id: number): Card => ({
  id,
  name: "WILD_DRAW_FOUR",
  value: undefined,
  color: COLOR.WILD,
  effectiveColor: undefined,
  type: Type.DRAW_4,
  effectBefore: draw4BeforeEffect,
  effectAfter: draw4AfterEffect,
  canBePutOver: draw4CanBePutOver,
});
