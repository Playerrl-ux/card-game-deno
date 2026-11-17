import z from "zod";
import { CardGenerator } from "./card.generator.ts";
import { CardQuantities } from "./card.ts";
import { DeckManager } from "./deck.manager.ts";
import { EventGuard, EventSocket } from "./event.guard.ts";
import { EventManager } from "./event.manager.ts";
import { PlayerManager } from "./player/player.manager.ts";
import { Player } from "./player/player.state.ts";
import { StateManager } from "./state.manager.ts";
import { DeckState, State, TurnState } from "./state.ts";
import { TurnManager } from "./turn.manager.ts";

export interface ModeTypes {
  CardType: unknown;
  ConfigType: unknown;
  PlayerStateType: Player<unknown>;
  TurnStateType: TurnState<unknown>;
  DeckStateType: DeckState<unknown>;
  StateType: State<unknown, unknown>;

  TurnManagerType: TurnManager<unknown, TurnState<unknown>, Player<unknown>>;
  DeckManagerType: DeckManager<unknown, unknown, DeckState<unknown>>;
  StateManagerType: StateManager<
    unknown,
    unknown,
    Player<unknown>,
    State<unknown, unknown>,
    EventManager<State<unknown, unknown>>
  >;
  EventManagerType: EventManager<State<unknown, unknown>>;
  EventGuardType: EventGuard;
  CardGeneratorType: CardGenerator<unknown, unknown>;
  PlayerManager: PlayerManager<unknown, State<unknown, unknown>>;
}

export interface Mode<T extends ModeTypes> {
  name: string;
  turnManager: T["TurnManagerType"];
  deckManager: T["DeckManagerType"];
  stateManager: T["StateManagerType"];
  eventManager: T["EventManagerType"];
  eventGuard: T["EventGuardType"];
  cardGenerator: T["CardGeneratorType"];
  playerManager: T["PlayerManager"];
}

export interface Elements<T extends ModeTypes> {
  id: number;
  state: T["StateType"];
  mode: Mode<T>;
  configs: T["ConfigType"];
}

export interface ModeIniter<MT extends ModeTypes> {
  name: string;
  quantities: CardQuantities;
  configsSchema: z.ZodType<MT["ConfigType"]>;
  init: (
    players: MT["PlayerStateType"][],
    configs: MT["ConfigType"],
    numberOfDecks: number,
    networkLayer: EventSocket,
    onVictory: (winnerId: number) => void,
    seed?: number,
  ) => Mode<MT>;
}
