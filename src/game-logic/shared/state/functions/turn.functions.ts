import { DIRECTION } from "../../../base/state.ts";
import { TurnManager } from "../../../base/turn.manager.ts";
import { Card, DefaultTurnState } from "../../cards/default.card.ts";
import { DefaultPlayerState } from "../../player/default.player.state.ts";
import {
  DoubleLinkedList,
  ListNode,
} from "../../structures/double-linked.list.ts";

export const DefaultTurnManager: TurnManager<
  Card,
  DefaultTurnState,
  DefaultPlayerState
> = {
  setNextPlayer(player: DefaultPlayerState, turnState: DefaultTurnState) {
    const node = turnState.players.find(player);
    if (node) {
      turnState.nextPlayer = node;
    }
  },

  setupNextPlayerTurn(turnState: DefaultTurnState) {
    //adicionar um log aqui
    if (turnState.players.size === 1) return;
    if (!turnState.nextPlayer) return;
    turnState.currentPlayer = turnState.nextPlayer;
    if (turnState.direction === "RIGHT") {
      turnState.nextPlayer = turnState.nextPlayer
        .right as ListNode<DefaultPlayerState>;
    } else {
      turnState.nextPlayer = turnState.nextPlayer
        .left as ListNode<DefaultPlayerState>;
    }
    turnState.turn++;
  },

  changeDirection(turnState: DefaultTurnState) {
    if (turnState.direction === DIRECTION.RIGHT) {
      turnState.direction = DIRECTION.LEFT;
      turnState.nextPlayer = turnState.currentPlayer
        .left as ListNode<DefaultPlayerState>;
    } else {
      turnState.direction = DIRECTION.RIGHT;
      turnState.nextPlayer = turnState.currentPlayer
        .right as ListNode<DefaultPlayerState>;
    }
  },

  getNext(player: DefaultPlayerState, turnState: DefaultTurnState) {
    const node = turnState.players.find(player);
    if (!node) return undefined;
    if (turnState.direction === "RIGHT") {
      return node.right?.value as DefaultPlayerState;
    } else {
      return node.left?.value as DefaultPlayerState;
    }
  },

  getPrevious(player: DefaultPlayerState, turnState: DefaultTurnState) {
    const node = turnState.players.find(player);
    if (!node) return undefined;
    if (turnState.direction === "RIGHT") {
      return node.left?.value as DefaultPlayerState;
    } else {
      return node.right?.value as DefaultPlayerState;
    }
  },

  skipNext(player: DefaultPlayerState, turnState: DefaultTurnState) {
    const nextPlayer = this.getNext(player, turnState);
    if (!nextPlayer) return;
    const next = this.getNext(nextPlayer, turnState);
    if (!next) return;
    this.setNextPlayer(next, turnState);
  },

  getCurrent(turnState: DefaultTurnState) {
    return turnState.currentPlayer?.value;
  },

  setupCurrentPlayerTurn(
    player: DefaultPlayerState,
    turnState: DefaultTurnState,
  ) {
    const node = turnState.players.find(player);
    if (node) {
      turnState.currentPlayer = node;
      const next = this.getNext(player, turnState);
      if (next) {
        this.setNextPlayer(next, turnState);
      }
    }
  },

  createTurnState(
    players: DefaultPlayerState[],
    state?: { seed?: number; randomManager?: any },
  ) {
    const playersList = new DoubleLinkedList<DefaultPlayerState>(players);
    let startHead = playersList.head;
    if (state && state.randomManager && players.length > 0) {
      const startIndex = state.randomManager.nextInt(players.length, state);
      let curr = playersList.head;
      for (let i = 0; i < startIndex; i++) {
        if (curr?.right) curr = curr.right;
      }
      startHead = curr;
    }
    return {
      players: playersList,
      currentPlayer: startHead,
      nextPlayer: startHead?.right,
      turn: 0,
      direction: DIRECTION.RIGHT,
    } as DefaultTurnState;
  },
};
