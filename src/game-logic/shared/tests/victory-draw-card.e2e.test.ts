import { describe, expect, test, vi } from "vitest";
import { DefaultEventGuard } from "../events/event.guard.ts";
import { DefautlEventManager } from "../events/event.manager.ts";
import {
  createMockCard,
  createMockDeckState,
  createMockPlayer,
  createMockState,
  createMockTurnState,
} from "./mocks.ts";
import { COLOR, Configs, Type } from "../cards/default.card.ts";
import { createDraw2 } from "../cards/special-models/draw-2.model.ts";
import { ClientEventPayloads } from "../events/client/client-payloads.ts";
import { ServerEventPayloads } from "../events/server/server-payloads.ts";

describe("E2E - Vitória ao descartar carta de compra (+2) e cancelamento de promises", () => {
  const configs: Configs = {
    SEVEN_HAS_EFFECT: true,
    ZERO_HAS_EFFECT: true,
    DRAW_2_OVER_DRAW_4: true,
    DRAW_UNTIL_HAVE: true,
    JUMPIN: true,
    DRAW_4_CHALLENGES: true,
    CanWin: true,
  };

  test("Cenário 1: Jogador ganha jogando carta de compra normal (+2) - não deve deixar waiters pendentes nem rejeitar com Game Destroyed", async () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const p3 = createMockPlayer(3);

    // P1 tem apenas 1 carta (+2) e vencerá a partida ao descartá-la
    const draw2Card = createDraw2(configs, 100, COLOR.BLUE, "BLUE_+2");
    p1.hand = [draw2Card];

    p2.hand = [createMockCard(200, Type.NUMBERED, COLOR.RED, 5)];
    p3.hand = [createMockCard(300, Type.NUMBERED, COLOR.RED, 6)];

    const turnState = createMockTurnState([p1, p2, p3]);
    const topCard = createMockCard(999, Type.NUMBERED, COLOR.BLUE, 0);
    const deckState = createMockDeckState(
      [
        createMockCard(501, Type.NUMBERED, COLOR.YELLOW, 1),
        createMockCard(502, Type.NUMBERED, COLOR.YELLOW, 2),
      ],
      topCard,
    );
    deckState.wholeDeck[100] = draw2Card;
    deckState.wholeDeck[999] = topCard;

    const state = createMockState([p1, p2, p3], deckState, turnState);
    state.configs = configs;

    let finishGameCalled = false;
    let waitersPendingAtVictory: any[] = [];

    // O onVictory simula exatamente o RoomManager.finishGame():
    // ao detectar vitória, cancela todos os waiters pendentes
    const guard = new DefaultEventGuard(state, (winnerId: number) => {
      finishGameCalled = true;
      waitersPendingAtVictory = [...eventManager.pendingWaitersInfo];
      guard.eventManager.cancelAllWaiters();
    });
    const eventManager = guard.eventManager as DefautlEventManager;
    const emitSpy = vi.spyOn(eventManager, "emitToClient");

    // P1 joga a carta de compra (+2) na sua vez
    state.eventsValidMap.set(p1, [ClientEventPayloads.PLAY_CARD.commomName]);
    guard.guard(p1, ClientEventPayloads.PLAY_CARD.commomName, { cardId: 100 });

    // Aguarda microtasks/resoluções
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Validações de fim de jogo
    expect(p1.hand.length).toBe(0);
    expect(finishGameCalled).toBe(true);
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: ServerEventPayloads.WIN.broadcastName,
        data: {},
      }),
    );

    // O próximo jogador (P2) comprou as 2 cartas da penalidade
    expect(p2.hand.length).toBe(3);
    expect(state.room.currentDraw).toBe(0);

    // [FALHA ESPERADA]:
    // Na vitória, o jogo NÃO deveria ter iniciado um novo turno com changeTurn(),
    // portanto não deveria existir nenhum waiter pendente no momento da vitória.
    expect(waitersPendingAtVictory).toHaveLength(0);
  });

  test("Cenário 2: Jogador ganha jogando carta de compra (+2) através de Jump-In - não deve deixar waiters pendentes nem rejeitar com Game Destroyed", async () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const p3 = createMockPlayer(3);

    // P1 está no turno e acabou de jogar um BLUE_+2
    const topDraw2 = createDraw2(configs, 100, COLOR.BLUE, "BLUE_+2");
    
    // P2 tem exatamente o mesmo BLUE_+2 como sua ÚNICA carta na mão e vai dar Jump-In para vencer!
    const jumpInDraw2 = createDraw2(configs, 200, COLOR.BLUE, "BLUE_+2");
    p2.hand = [jumpInDraw2];

    p1.hand = [createMockCard(101, Type.NUMBERED, COLOR.RED, 5)];
    p3.hand = [createMockCard(300, Type.NUMBERED, COLOR.RED, 6)];

    const turnState = createMockTurnState([p1, p2, p3]);
    const deckState = createMockDeckState(
      [
        createMockCard(501, Type.NUMBERED, COLOR.YELLOW, 1),
        createMockCard(502, Type.NUMBERED, COLOR.YELLOW, 2),
        createMockCard(503, Type.NUMBERED, COLOR.YELLOW, 3),
        createMockCard(504, Type.NUMBERED, COLOR.YELLOW, 4),
      ],
      topDraw2,
    );
    deckState.wholeDeck[100] = topDraw2;
    deckState.wholeDeck[200] = jumpInDraw2;

    const state = createMockState([p1, p2, p3], deckState, turnState);
    state.configs = configs;
    state.room.currentDraw = 2; // Acumulado pelo +2 do topo

    let finishGameCalled = false;
    let waitersPendingAtVictory: any[] = [];

    const guard = new DefaultEventGuard(state, (winnerId: number) => {
      finishGameCalled = true;
      waitersPendingAtVictory = [...eventManager.pendingWaitersInfo];
      guard.eventManager.cancelAllWaiters();
    });
    const eventManager = guard.eventManager as DefautlEventManager;
    const emitSpy = vi.spyOn(eventManager, "emitToClient");

    // P2 realiza o Jump-In com a sua última carta
    state.eventsValidMap.set(p2, [ClientEventPayloads.JUMP_IN.commomName]);
    guard.guard(p2, ClientEventPayloads.JUMP_IN.commomName, {
      cardJumpedId: 200,
      targetId: 100,
    });

    // Aguarda microtasks/resoluções
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Validações de vitória do P2
    expect(p2.hand.length).toBe(0);
    expect(finishGameCalled).toBe(true);
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: ServerEventPayloads.WIN.broadcastName,
        data: {},
      }),
    );

    // O próximo jogador da ordem comprou as cartas acumuladas
    expect(state.room.currentDraw).toBe(0);

    // [FALHA ESPERADA]:
    // Na vitória por Jump-In, nenhum waiter deve ter sido criado para um próximo turno.
    expect(waitersPendingAtVictory).toHaveLength(0);
  });
});
