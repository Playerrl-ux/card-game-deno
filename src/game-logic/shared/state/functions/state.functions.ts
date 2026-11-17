import { StateManager } from "../../../base/state.manager.ts";
import {
  Card,
  Configs,
  DefaultRoomState,
  DefaultState,
} from "../../cards/default.card.ts";
import { DEFAULT_EVENTS } from "../../events/default-events.ts";
import { DefautlEventManager } from "../../events/event.manager.ts";
import { DefaultPlayerState } from "../../player/default.player.state.ts";
import { DefaultDeckManager } from "./deck.functions.ts";
import { DefaultTurnManager } from "./turn.functions.ts";
import { DefaultPlayerManager } from "../../player/default.player.manager.ts";
import { DefaultRandomManager } from "../../utils/random.manager.ts";
import { GameTimer } from "../../../base/state.ts";
import { CheapMap } from "../../player/cheap.map.ts";

import { SerializedCard } from "../../events/server/server-payloads.ts";
import { serializeCard } from "../../utils/card.utils.ts";
import { ServerEventArgs } from "../../../base/server.event.ts";

export const DefaultModeName = "DEFAUTL_MODE";

export interface PlayerSnapshotInfo {
  id: number;
  handCount: number;
  lastClientEventName: string | null;
}

export interface DefaultGameSnapshot {
  players: PlayerSnapshotInfo[];
  playerOrder: number[];
  currentPlayerId: number;
  direction: string;
  handCards: SerializedCard[];
  topDiscard: SerializedCard | null;
  timers: {
    duration: number;
    createdAt: number;
    remainingTime: number;
  }[];
  lastEvent: { name: string; data: unknown; sendedBy?: number } | null;
  lastClientEventName: string | null;
  allowedEvents: string[];
  gameRound: number;
  configs: Record<string, unknown>;
}

export const DefaultStateManager: StateManager<
  Card,
  Configs,
  DefaultPlayerState,
  DefaultState,
  DefautlEventManager,
  DefaultGameSnapshot
> = {
  setupNextPlayer(player: DefaultPlayerState, state: DefaultState) {
    DefaultTurnManager.setNextPlayer(player, state.room.turn);
    state.eventsForNextPlayer = DEFAULT_EVENTS;
  },

  createState(players, configs, quantities, numberOfDecks, seed?: number) {
    const initialSeed = DefaultRandomManager.initSeed(seed);
    const partialState = {
      seed: initialSeed,
      randomManager: DefaultRandomManager,
    };

    const turnState = DefaultTurnManager.createTurnState(players, partialState);
    const deckState = DefaultDeckManager.createDeckState(
      quantities,
      numberOfDecks,
      configs,
      partialState,
    );
    const roomState = {
      players,
      turn: turnState,
      deck: deckState,
      currentDraw: 0,
    } as DefaultRoomState;

    return {
      stateId: 0,
      seed: partialState.seed,
      initialSeed: initialSeed,
      room: roomState,
      eventsValidMap: new CheapMap<{ id: number }, string>(
        players.length + 1,
        players,
      ),
      activeTimer: undefined,
      eventsForNextPlayer: undefined,
      gameRound: 0,
      configs: configs,
      currentMode: DefaultModeName,
      randomManager: DefaultRandomManager,
      deckManager: DefaultDeckManager,
      turnManager: DefaultTurnManager,
      playerManager: DefaultPlayerManager,
      stateManager: this,
      victoryTriggered: false,
    };
  },

  createEventManager(state: DefaultState) {
    return new DefautlEventManager(state);
  },

  setupMode(players, configs, quantities, numberOfDecks, seed?: number) {
    const state = this.createState(
      players,
      configs,
      quantities,
      numberOfDecks,
      seed,
    );
    return this.createEventManager(state);
  },

  createSnapshot(
    state: DefaultState,
    player: DefaultPlayerState,
  ): DefaultGameSnapshot {
    const players: PlayerSnapshotInfo[] = (state.room.players || []).map(
      (p) => ({
        id: p.id,
        handCount: p.hand ? p.hand.length : 0,
        lastClientEventName: p.network?.lastClientEventName || null,
      }),
    );

    const playerOrder: number[] = [];
    let node = state.room.turn?.players?.head;
    if (node) {
      const startNode = node;
      do {
        playerOrder.push(node.value.id);
        node = node.right;
      } while (node && node !== startNode);
    }

    const currentPlayerId = state.room.turn?.currentPlayer
      ? state.room.turn.currentPlayer.value.id
      : 0;

    const direction = state.room.turn?.direction || "RIGHT";

    const handCards = player.hand ? player.hand.map(serializeCard) : [];

    const topDiscardCard = state.room.deck?.topDiscard;
    const topDiscard: SerializedCard | null = topDiscardCard
      ? serializeCard(topDiscardCard)
      : null;

    const now = Date.now();
    const isPlayerAllowed = state.activeTimer?.allowedPlayers.some(
      (p) => p.id === player.id,
    );
    const timers =
      state.activeTimer && state.activeTimer.isActive && isPlayerAllowed
        ? [
            {
              duration: state.activeTimer.duration,
              createdAt: state.activeTimer.createdAt,
              remainingTime: Math.max(
                0,
                state.activeTimer.duration - (now - state.activeTimer.createdAt),
              ),
            },
          ]
        : [];

    const rawLastEvent = player.network?.lastEvent;
    const lastEvent = rawLastEvent
      ? {
          name: rawLastEvent.name,
          data: rawLastEvent.data,
          sendedBy:
            typeof rawLastEvent.sendedBy === "object" && rawLastEvent.sendedBy !== null
              ? (rawLastEvent.sendedBy as any).id ?? -1
              : typeof rawLastEvent.sendedBy === "number"
              ? rawLastEvent.sendedBy
              : -1,
        }
      : null;
    const lastClientEventName = player.network?.lastClientEventName || null;
    const allowedEvents = state.eventsValidMap?.get(player) || [];
    const gameRound = state.gameRound || 0;

    return {
      players,
      playerOrder,
      currentPlayerId,
      direction,
      handCards,
      topDiscard,
      timers,
      lastEvent,
      lastClientEventName,
      allowedEvents,
      gameRound,
      configs: (state.configs as unknown as Record<string, unknown>) ?? {},
    };
  },
};
