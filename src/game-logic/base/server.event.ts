// um evento assim pode ser enviado pelo proprio servidor, nao ser um evento repassado entre clientes

import { Player } from "./player/player.state.ts";

export abstract class ServerEventArgs<T> {
  name: string;
  sendedBy: Player<unknown> | null;
  for: Player<unknown>[];
  data: T;
  isExternal: boolean;

  constructor(
    name: string,
    sendedBy: Player<unknown> | null,
    for1: Player<unknown>[],
    data: T,
    isExternal: boolean = false,
  ) {
    this.name = name;
    this.sendedBy = sendedBy;
    this.for = for1;
    this.data = data;
    this.isExternal = isExternal;
  }
}

export const SERVER_PREFIX = "output:";
