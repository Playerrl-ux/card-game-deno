import { DefaultPlayerState } from "../../player/default.player.state.ts";
import { DefaultServerEvent } from "./server.default.event.ts";
import {
  DEFAULT_TURN_TIMEOUT,
  ServerEventPayloads,
  ServerPayload,
} from "./server-payloads.ts";

export { DEFAULT_TURN_TIMEOUT };

export class PermissionsEvent extends DefaultServerEvent<
  ServerPayload<"PERMISSIONS">
> {
  constructor(
    sendedBy: DefaultPlayerState | null,
    for1: DefaultPlayerState[],
    data: Omit<ServerPayload<"PERMISSIONS">, "timeout"> & { timeout?: number },
    defaultTimeout = DEFAULT_TURN_TIMEOUT,
  ) {
    super(ServerEventPayloads.PERMISSIONS.commomName, sendedBy, for1, {
      ...data,
      timeout: data.timeout ?? defaultTimeout,
    });
  }
}
