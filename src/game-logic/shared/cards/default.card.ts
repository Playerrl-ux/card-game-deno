import z from "zod";
import { Effect, ID } from "../../base/card.ts";
import { EventManager } from "../../base/event.manager.ts";
import { State } from "../../base/state.ts";

export enum COLOR {
  BLUE = "BLUE",
  RED = "RED",
  GREEN = "GREEN",
  YELLOW = "YELLOW",
  WILD = "WILD",
}

export enum Type {
  BLOCK = "BLOCK",
  DRAW_4 = "DRAW_4",
  DRAW_2 = "DRAW_2",
  NUMBERED = "NUMBERED",
  WILD_CARD = "WILD_CARD",
  REVERSE = "REVERSE",
}

export enum CAN_CHANGE {
  YES = "YES",
  NO = "NO",
}

export const configSchema = z.object({
  SEVEN_HAS_EFFECT: z.boolean(),
  ZERO_HAS_EFFECT: z.boolean(),
  // +2 pode ser jogado em cima de um +4 desde que seja da mesma cor do +4
  DRAW_2_OVER_DRAW_4: z.boolean(),
  DRAW_UNTIL_HAVE: z.boolean(),
  JUMPIN: z.boolean(),
  DRAW_4_CHALLENGES: z.boolean(),
  CanWin: z.boolean().optional(),
  isTestRoom: z.boolean().optional(),
  seed: z.number().int().optional(),
});

export type Configs = z.infer<typeof configSchema>;

export type DefaulEffect = Effect<
  Card,
  Configs,
  DefaultState,
  EventManager<DefaultState>,
  CAN_CHANGE | void
>;

import { RandomManager } from "../../base/random.manager.ts";
import { DeckManager } from "../../base/deck.manager.ts";
import { TurnManager } from "../../base/turn.manager.ts";
import { PlayerManager } from "../../base/player/player.manager.ts";
import { StateManager } from "../../base/state.manager.ts";
import type { DefautlEventManager } from "../events/event.manager.ts";
import type { DefaultPlayerState } from "../player/default.player.state.ts";

export interface DefaultState extends State<Card, Configs> {
  seed?: number;
  initialSeed?: number;
  randomManager: RandomManager;
  deckManager: DeckManager<Card, Configs, DefaultDeckState>;
  turnManager: TurnManager<Card, DefaultTurnState, DefaultPlayerState>;
  playerManager: PlayerManager<Card, DefaultState>;
  stateManager?: StateManager<
    Card,
    Configs,
    DefaultPlayerState,
    DefaultState,
    DefautlEventManager
  >;
}

export type DefaultRoomState = DefaultState["room"];

export type DefaultDeckState = DefaultRoomState["deck"];

export type DefaultTurnState = DefaultRoomState["turn"];

export interface Card extends ID {
  name: string;
  value?: number;
  color: COLOR;
  effectiveColor?: COLOR;
  type: Type;
  //effect before vai ser acionado imediatamente ao descarte da carta
  effectBefore: DefaulEffect;
  //effect after vai ser acionado depois que o jumpin for resolvido. Se retornar true, bloqueia o tryChange automático.
  effectAfter: DefaulEffect;
  canBePutOver: (current: Card, target: Card, state: DefaultState) => boolean;
}

//current = card to be played, target = card already played
// Essa funcao sera usada por cartas que nao tem efeitos de compra. Para +2 e +4, outra implementacao sera usada
export const baseCanBePutOver = (
  current: Card,
  target: Card,
  state: DefaultState,
): boolean => {
  // cartas com essa implementacao base nao podem ser jogadas com uma cadeia de compra ativa
  // para fazer o 0 ser jogavel nessa situacao, por exemplo, seria preciso implementar uma versao diferente
  // dessa funcao para ele
  if (state.room.currentDraw > 0) {
    return false;
  }
  if (current.color === COLOR.WILD) return true;
  const targetColor = target.effectiveColor || target.color;
  return (
    // caso as cores forem as mesmas
    current.color === targetColor ||
    // caso as cartas sejam de numeros e os numeros forem iguais
    (current.value === target.value &&
      target.value !== undefined &&
      target.type === Type.NUMBERED) ||
    // caso o tipo das cartas seja o mesmo(cartas de efeito/especiais)
    (current.type !== Type.NUMBERED && target.type === current.type)
  );
};
