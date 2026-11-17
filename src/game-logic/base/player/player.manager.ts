import { State } from "../state.ts";
import { Player } from "./player.state.ts";

export interface PlayerManager<C, S extends State<C, unknown>> {
  getCard(id: number, player: Player<C>): C | undefined;
  play(id: number, player: Player<C>): C | undefined;
  addCards(cards: C[], player: Player<C>): void;
  checkPlayCard(discardTop: C, player: Player<C>, state: S): C[];
}
