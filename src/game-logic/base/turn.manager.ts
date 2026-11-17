import { Player } from "./player/player.state.ts";
import { TurnState } from "./state.ts";

export interface TurnManager<C, S extends TurnState<C>, P extends Player<C>> {
  setNextPlayer(player: P, turnState: S): void;
  setupNextPlayerTurn(turnState: S): void;
  changeDirection(turnState: S): void;
  getNext(player: P, turnState: S): P | undefined;
  getPrevious(player: P, turnState: S): P | undefined;
  skipNext(player: P, turnState: S): void;
  getCurrent(turnState: S): P | undefined;
  setupCurrentPlayerTurn(player: P, turnState: S): void;

  createTurnState(
    players: P[],
    state?: { seed?: number; randomManager?: any },
  ): S;
}
