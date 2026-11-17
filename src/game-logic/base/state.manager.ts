import { CardQuantities } from "./card.ts";
import { EventManager } from "./event.manager.ts";
import { Player } from "./player/player.state.ts";
import { State } from "./state.ts";

export interface StateManager<
  C,
  CO,
  P extends Player<C>,
  S extends State<C, CO>,
  E extends EventManager<S>,
  SN = unknown,
> {
  setupNextPlayer(player: P, state: S): void;

  createState(
    players: P[],
    configs: CO,
    quantities: CardQuantities,
    numberOfDecks: number,
    seed?: number,
  ): S;

  createEventManager(state: S): E;

  setupMode(
    players: P[],
    configs: CO,
    quantities: CardQuantities,
    numberOfDecks: number,
    seed?: number,
  ): E;

  createSnapshot(state: S, player: P): SN;
}
