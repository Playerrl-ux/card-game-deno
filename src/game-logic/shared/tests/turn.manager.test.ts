import { describe, expect, test } from "vitest";
import { DefaultTurnManager } from "../state/functions/turn.functions.ts";
import { createMockPlayer } from "./mocks.ts";
import { DIRECTION } from "../../base/state.ts";

describe("DefaultTurnManager", () => {
  test("createTurnState deve inicializar corretamente o estado do turno", () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const turnState = DefaultTurnManager.createTurnState([p1, p2]);

    expect(turnState.currentPlayer.value).toBe(p1);
    expect(turnState.nextPlayer.value).toBe(p2);
    expect(turnState.turn).toBe(0);
    expect(turnState.direction).toBe(DIRECTION.RIGHT);
  });

  test("setNextPlayer deve atualizar correctamente o próximo jogador", () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const p3 = createMockPlayer(3);
    const turnState = DefaultTurnManager.createTurnState([p1, p2, p3]);

    DefaultTurnManager.setNextPlayer(p3, turnState);
    expect(turnState.nextPlayer.value).toBe(p3);
  });

  test("setupNextPlayerTurn avançará o turno no sentido DIREITA", () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const p3 = createMockPlayer(3);
    const turnState = DefaultTurnManager.createTurnState([p1, p2, p3]);

    DefaultTurnManager.setupNextPlayerTurn(turnState);
    // p1 passa para p2
    expect(turnState.currentPlayer.value).toBe(p2);
    expect(turnState.nextPlayer.value).toBe(p3);
    expect(turnState.turn).toBe(1);

    // Avança mais uma vez (circular)
    DefaultTurnManager.setupNextPlayerTurn(turnState);
    expect(turnState.currentPlayer.value).toBe(p3);
    expect(turnState.nextPlayer.value).toBe(p1);
  });

  test("changeDirection deve inverter a direção do jogo e reconfigurar o próximo jogador", () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const p3 = createMockPlayer(3);
    const turnState = DefaultTurnManager.createTurnState([p1, p2, p3]);

    // Inicialmente: Current = p1, Next = p2 (sentido direita: p1 -> p2 -> p3 -> p1)
    DefaultTurnManager.changeDirection(turnState);

    expect(turnState.direction).toBe(DIRECTION.LEFT);
    // Sentido esquerda: Current = p1, Next deve ser p3 (esquerda de p1 na lista circular [p1, p2, p3])
    expect(turnState.nextPlayer.value).toBe(p3);

    // Muda novamente para direita
    DefaultTurnManager.changeDirection(turnState);
    expect(turnState.direction).toBe(DIRECTION.RIGHT);
    expect(turnState.nextPlayer.value).toBe(p2);
  });

  test("getNext e getPrevious devem retornar jogadores relativos baseando-se na direção", () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const p3 = createMockPlayer(3);
    const turnState = DefaultTurnManager.createTurnState([p1, p2, p3]);

    // Sentido Direita (RIGHT)
    expect(DefaultTurnManager.getNext(p2, turnState)).toBe(p3);
    expect(DefaultTurnManager.getPrevious(p2, turnState)).toBe(p1);

    // Inverte a direção (LEFT)
    DefaultTurnManager.changeDirection(turnState);
    expect(DefaultTurnManager.getNext(p2, turnState)).toBe(p1);
    expect(DefaultTurnManager.getPrevious(p2, turnState)).toBe(p3);
  });

  test("skipNext deve pular o próximo jogador", () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const p3 = createMockPlayer(3);
    const p4 = createMockPlayer(4);
    const turnState = DefaultTurnManager.createTurnState([p1, p2, p3, p4]);

    // p1 joga e pula o próximo (p2). O próximo a jogar deve ser p3.
    DefaultTurnManager.skipNext(p1, turnState);
    expect(turnState.nextPlayer.value).toBe(p3);
  });

  test("setupCurrentPlayerTurn define jogador atual manualmente", () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const p3 = createMockPlayer(3);
    const turnState = DefaultTurnManager.createTurnState([p1, p2, p3]);

    // Forçar turno para p3
    DefaultTurnManager.setupCurrentPlayerTurn(p3, turnState);
    expect(turnState.currentPlayer.value).toBe(p3);
    expect(turnState.nextPlayer.value).toBe(p1); // direita de p3
  });
});
