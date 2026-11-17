import { ActionSignature } from "./client.event.ts";
import { Player } from "./player/player.state.ts";
import { ServerEventArgs } from "./server.event.ts";
import { State } from "./state.ts";

export interface ChangeTurnParams<
  T extends State<any, any, any, any>,
  E extends EventManager<T>,
> {
  eventsAllowed?: string[];
  timeout?: number;
  timeoutAction?: (state: T, eventManager: E) => void;
  allowedCards?: any[];
}

export interface WaiterInfo {
  id: number;
  action: string;
  cardId?: number;
  eventsName: string[];
  players: number[];
  createdAt: number;
}

export interface EventManager<
  T extends State<any, any, any, any> = State<any, any, any, any>,
> {
  state: T;
  waitersInfo?: WaiterInfo[];
  pendingWaitersInfo?: WaiterInfo[];
  emitToClient(serverEvent: ServerEventArgs<unknown>): void;

  initGame(
    roomName?: string,
    modeName?: string,
  ): Promise<{
    eventReturned: string;
    data: unknown;
  } | void> | void;

  tryChange(params?: ChangeTurnParams<T, any>): void;

  changeTurn(params?: ChangeTurnParams<T, any>): Promise<{
    eventReturned: string;
    data: unknown;
  }>;

  waitForEvent(
    eventsName: string[],
    timeout: number,
    players: Player<unknown>[],
    allowedCards: any[],
    timeoutAction?: (state: T, eventManager: EventManager<T>) => void,
    meta?: { action?: string; cardId?: number },
  ): Promise<{
    eventReturned: string;
    data: unknown;
    player?: Player<unknown>;
  }>;

  cancelAllWaiters(): void;

  pauseTimer(player: Player<unknown>): void;

  sendErrorAndReactivateTimer(player: Player<unknown>, message: string): void;

  emit<U, C>(name: string, data: U, player: Player<C>): void;

  registerAction<Data, Return, CardType>(
    name: string,
    action: ActionSignature<Data, Return, CardType, T>,
  ): this;

  onVictory(winnerId: number): void;
}
