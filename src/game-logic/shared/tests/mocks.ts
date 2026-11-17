import {
  Card,
  COLOR,
  Type,
  baseCanBePutOver,
  DefaultDeckState,
  DefaultState,
  DefaultTurnState,
} from "../cards/default.card.ts";
import { DefaultPlayerState } from "../player/default.player.state.ts";
import { CheapMap } from "../player/cheap.map.ts";
import { DoubleLinkedList } from "../structures/double-linked.list.ts";
import { DIRECTION, GameTimer } from "../../base/state.ts";

export function createMockCard(
  id: number,
  type: Type = Type.NUMBERED,
  color: COLOR = COLOR.BLUE,
  value?: number,
): Card {
  return {
    id,
    name: `${color}_${type}_${value ?? ""}`,
    color,
    value,
    type,
    effectBefore: () => {},
    effectAfter: () => {},
    canBePutOver: (current: Card, target: Card, state: DefaultState) =>
      baseCanBePutOver(current, target, state),
  };
}

export function createMockPlayer(
  id: number,
  handCards: Card[] = [],
): DefaultPlayerState {
  return {
    id,
    hand: handCards,
    network: {
      sendToPlayer: () => {},
    },
  };
}

export function createMockTurnState(
  players: DefaultPlayerState[],
): DefaultTurnState {
  const playersList = new DoubleLinkedList<DefaultPlayerState>(players);
  return {
    players: playersList,
    currentPlayer: playersList.head!,
    nextPlayer: playersList.head!.right!,
    turn: 0,
    direction: DIRECTION.RIGHT,
  };
}

export function createMockDeckState(
  deckCards: Card[] = [],
  topDiscardCard?: Card,
): DefaultDeckState {
  const finalTopDiscard =
    topDiscardCard || createMockCard(999, Type.NUMBERED, COLOR.RED, 5);
  return {
    wholeDeck: [...deckCards, finalTopDiscard],
    baseCards: [],
    deck: [...deckCards],
    discardPile: [],
    topDiscard: finalTopDiscard,
  };
}

import { DefaultDeckManager } from "../state/functions/deck.functions.ts";
import { DefaultTurnManager } from "../state/functions/turn.functions.ts";
import { DefaultPlayerManager } from "../player/default.player.manager.ts";
import { DefaultStateManager } from "../state/functions/state.functions.ts";
import { DefaultRandomManager } from "../utils/random.manager.ts";

export function createMockState(
  players: DefaultPlayerState[],
  deckState: DefaultDeckState,
  turnState: DefaultTurnState,
): DefaultState {
  return {
    seed: 12345,
    room: {
      players,
      deck: deckState,
      turn: turnState,
      currentDraw: 0,
    },
    eventsValidMap: new CheapMap<{ id: number }, string>(
      players.length + 1,
      players,
    ),
    activeTimer: undefined,
    eventsForNextPlayer: undefined,
    gameRound: 1,
    configs: {
      SEVEN_HAS_EFFECT: true,
      ZERO_HAS_EFFECT: true,
      DRAW_2_OVER_DRAW_4: true,
      DRAW_UNTIL_HAVE: true,
      JUMPIN: true,
      DRAW_4_CHALLENGES: true,
    },
    currentMode: "DEFAULT_MODE",
    randomManager: DefaultRandomManager,
    deckManager: DefaultDeckManager,
    turnManager: DefaultTurnManager,
    playerManager: DefaultPlayerManager,
    stateManager: DefaultStateManager,
    victoryTriggered: false,
  };
}
