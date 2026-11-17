import { IBotManager } from "../../bot/bot.types.ts";
import {
  DoubleLinkedList,
  ListNode,
} from "../shared/structures/double-linked.list.ts";
import { Player } from "./player/player.state.ts";
import { DeckManager } from "./deck.manager.ts";
import { TurnManager } from "./turn.manager.ts";
import { PlayerManager } from "./player/player.manager.ts";
import { EventManager } from "./event.manager.ts";
import { RandomManager } from "./random.manager.ts";
import { StateManager } from "./state.manager.ts";
import { DefaultState } from "../shared/cards/default.card.ts";
import { DefautlEventManager } from "../shared/events/event.manager.ts";

export interface DeckState<C> {
  baseCards: C[];
  wholeDeck: C[];
  deck: C[];
  discardPile: C[];
  topDiscard: C;
}

export enum DIRECTION {
  RIGHT = "RIGHT",
  LEFT = "LEFT",
}

export interface TurnState<C> {
  players: DoubleLinkedList<Player<C>>;
  currentPlayer: ListNode<Player<C>>;
  nextPlayer: ListNode<Player<C>>;
  direction: DIRECTION;
  turn: number;
}

export interface RoomState<C> {
  players: Player<C>[];
  turn: TurnState<C>;
  deck: DeckState<C>;
  currentDraw: number;
}

export interface GameMap<k extends { id: number }, v> {
  get(key: k): v | undefined;

  set(key: k, data: v): v;

  reset(key: k): void;

  resetAll(): void;

  get data(): v[];
}

export type GameTimer = {
  timer: NodeJS.Timeout | undefined;
  createdAt: number;
  duration: number;
  isActive: boolean;
  eventsName: string[];
  allowedPlayers: { id: number }[];
  timeoutEventName: string;
  cleanup?: () => void;
  timeoutActionCallback?: (
    state: DefaultState,
    eventManager: DefautlEventManager,
  ) => void;
};

export interface State<
  C,
  CO,
  ES extends string[] = string[],
  GT extends GameTimer = GameTimer,
> {
  room: RoomState<C>;
  currentMode: string; // criar um id para cada modo
  gameRound: number;
  // eventos que cada player pode enviar para o servidor. Cada posicao no array corresponde
  // a um array de eventos para o player de mesmo id
  eventsValidMap: GameMap<{ id: number }, ES>;

  // timer único ativo do jogo aguardando ação de jogador(es)
  activeTimer?: GT;

  // esse sera o array que os eventos vao mecher, o array final vai ser setado
  // no evento de mudanca de turno ou de forma explicita
  eventsForNextPlayer: ES | undefined;

  configs: CO;

  seed?: number;
  initialSeed?: number;

  // Managers tipados com as interfaces base
  randomManager?: RandomManager;
  deckManager?: DeckManager<C, CO, DeckState<C>>;
  turnManager?: TurnManager<C, TurnState<C>, Player<C>>;
  playerManager?: PlayerManager<C, State<C, CO, ES, GT>>;
  botManager?: IBotManager;
  stateManager?: StateManager<
    C,
    CO,
    Player<C>,
    State<C, CO, ES, GT>,
    EventManager<State<C, CO, ES, GT>>
  >;
  victoryTriggered: boolean;
}
