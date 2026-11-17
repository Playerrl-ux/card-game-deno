import { ZodType } from "zod";
import { EventManager } from "./event.manager.ts";
import { Player } from "./player/player.state.ts";
import { State } from "./state.ts";

export type ActionSignature<T, U, C, S extends State<any, any>> = (
  state: S,
  eventManager: EventManager<S>,
  data: T,
  player: Player<C>,
) => U;

// Na maioria das vezes U vai ser void, mas em alguns casos a action de um evento vai ser usada dentro de um efeito,
// e ai seria util que esse evento retornasse alguma coisa para passar informacoes relevantes
export interface ClientEvent<T, U, C, S extends State<any, any>> {
  name: string;
  dataSchema: ZodType<T>;
  action: ActionSignature<T, U, C, S>;
  validateData?: ActionSignature<T, boolean, C, S>;
}
