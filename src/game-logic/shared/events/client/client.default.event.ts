import { ClientEvent } from "../../../base/client.event.ts";
import { Card, DefaultState } from "../../cards/default.card.ts";
export interface DefaultClientEvent<T, U = Promise<void>> extends ClientEvent<
  T,
  U,
  Card,
  DefaultState
> {}
