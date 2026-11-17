import { ServerEventArgs } from "../game-logic/base/server.event.ts";
import { SerializedCard } from "../game-logic/shared/events/server/server-payloads.ts";
import { BotMemory } from "./bot.memory.ts";
import { PlayerSocket } from "../game-logic/base/player/player.state.ts";
import { DefaultState } from "../game-logic/shared/cards/default.card.ts";
import { EventManager } from "../game-logic/base/event.manager.ts";

export interface BotActionDispatcher {
  dispatch(eventName: string, data?: unknown): void;
}

export interface IBotAgent {
  playerId: number;
  minTimeout: number;
  maxTimeout: number;
  memory: BotMemory;
  allowedEvents: string[];
  allowedCardIds: number[];
  lastDrawnCard?: SerializedCard;
  hasDelay: boolean;
  actionTimer?: ReturnType<typeof setTimeout>;
  rngState: { seed?: number };
}

export type ServerEventHandler = (
  bot: IBotAgent,
  event: ServerEventArgs<unknown>,
) => void;

export interface IBotManager {
  handleClientEvent?: (eventName: string, data: unknown, botId: number) => void;
  getRegisteredBots(): Map<number, IBotAgent>;
  registerBotSocket(
    botId: number,
    socket: PlayerSocket,
    state: DefaultState,
    eventManager: EventManager<DefaultState>,
    seed?: number,
  ): IBotAgent;
  getOrCreateBot(botId: number, seed?: number): IBotAgent;
  removeBot(botId: number): void;
  onBotServerEvent(
    botId: number,
    event: ServerEventArgs<unknown>,
    state: DefaultState,
    eventManager: EventManager<DefaultState>,
  ): void;
  executeDecision(
    bot: IBotAgent,
    state: DefaultState,
    eventManager: EventManager<DefaultState>,
  ): void;
}
