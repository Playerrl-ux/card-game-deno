import { ReplayRepository } from "../../../db/replay.repository.ts";
import type { ServerEventArgs } from "../server.event.ts";

export interface PlayerSocket<W = unknown> {
  ws?: W;
  matchId?: string;
  replayRepository?: ReplayRepository;
  lastEvent?: ServerEventArgs<unknown> | { name: string; data: unknown; sendedBy?: number };
  lastClientEventName?: string | null;
  isConnected?: boolean;
  isBot?: boolean;
  onBotServerEvent?: (event: ServerEventArgs<unknown>) => void;
  lastSeenAt?: number;
  updateLastSeen?(): void;
  markDisconnected?(gracePeriodMs?: number, onBotAssumed?: () => void): void;
  markReconnected?(ws: W, onReconnected?: () => void): void;
  sendToPlayer(event: ServerEventArgs<unknown>): void;
}

export interface Player<C, S extends PlayerSocket = PlayerSocket> {
  id: number;
  hand: C[];
  network: S;
}
