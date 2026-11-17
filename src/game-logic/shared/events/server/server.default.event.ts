import { ServerEventArgs } from "../../../base/server.event.ts";
import { DefaultPlayerState } from "../../player/default.player.state.ts";

export class DefaultServerEvent<T> extends ServerEventArgs<T> {
  constructor(
    name: string,
    sendedBy: DefaultPlayerState | null,
    for1: DefaultPlayerState[],
    data: T,
  ) {
    super(name, sendedBy, for1, data);
    this.sendedBy = sendedBy;
    this.for = for1;
  }
}
