import { z } from "zod";
import { EventManager } from "./event.manager.ts";
import { Player } from "./player/player.state.ts";
import { State } from "./state.ts";

type EffectReturn<T> = string[][] | undefined | void | T;

// se eu nao passasse o card aqui eu teria que usar o this, que e extremamente error prone hoje em dia
// se vc esqueceu o motivo exato, pesquise por "binding of this javascript"
export type Effect<
  C,
  CO,
  S extends State<C, CO>,
  EM extends EventManager<S>,
  T = void,
> = (
  card: C,
  state: S,
  eventManager: EM,
  player: Player<C>,
) => EffectReturn<T> | Promise<EffectReturn<T>>;

export interface ID {
  id: number;
}

export const CardQuantitiesSchema = z.record(z.string(), z.number());
export type CardQuantities = z.infer<typeof CardQuantitiesSchema>;

// export type createCard = (configs: Configs, id: number) => Card;
