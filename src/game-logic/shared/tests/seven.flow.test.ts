import { describe, expect, test, vi } from "vitest";
import { playCardEvent } from "../events/client/play-card.event.ts";
import { create7, EFFECT_CHOOSE } from "../cards/special-models/seven.model.ts";
import { DefautlEventManager } from "../events/event.manager.ts";
import {
  createMockState,
  createMockPlayer,
  createMockTurnState,
  createMockDeckState,
  createMockCard,
} from "./mocks.ts";
import { COLOR, Configs, Type } from "../cards/default.card.ts";
import { PermissionsEvent } from "../events/server/permissions.event.ts";
import { VoidServerEvent } from "../events/server/void.events.ts";
import { HandChanged } from "../events/server/hand-changed.event.ts";
import { setupControlledWaitForEvent } from "./event-mock.utils.ts";
import { jumpInEvent } from "../events/client/jumpin.event.ts";
import { selectHandEvent } from "../events/client/select-hand.event.ts";

describe("Teste de Integração (Fluxo de jogo) - Efeito do Sete", () => {
  const configs: Configs = {
    SEVEN_HAS_EFFECT: true, // Habilita o efeito do 7
    ZERO_HAS_EFFECT: true,
    DRAW_2_OVER_DRAW_4: true,
    DRAW_UNTIL_HAVE: true,
    JUMPIN: true,
    DRAW_4_CHALLENGES: true,
  };

  test("deve permitir trocar de mão com outro jogador ao jogar a carta 7 (sem Jump-In)", async () => {
    // 1. Configurando o cenário: 3 jogadores (P1, P2, P3)
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const p3 = createMockPlayer(3);

    // Mão de P1: [BLUE_7, RED_3]
    const sevenCard = create7(configs, 100, COLOR.BLUE, "BLUE_7");
    const p1Card = createMockCard(101, Type.NUMBERED, COLOR.RED, 3);
    p1.hand = [sevenCard, p1Card];

    // Mão de P3: [RED_6]
    const p3Card = createMockCard(300, Type.NUMBERED, COLOR.RED, 6);
    p3.hand = [p3Card];

    const turnState = createMockTurnState([p1, p2, p3]);
    const deckState = createMockDeckState(
      [],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 2),
    );
    const state = createMockState([p1, p2, p3], deckState, turnState);
    const eventManager = new DefautlEventManager(state);

    const emitSpy = vi.spyOn(eventManager, "emitToClient");
    setupControlledWaitForEvent(eventManager, state, [
      { action: "wait" }, // SELECT_HAND
      { action: "wait" }, // Bloqueio do turno final
    ]);

    eventManager.on("PERMISSIONS", (e: PermissionsEvent) => {
      const allowedEventsP1 = e.data.allowedEvents[1] || []; // Id 1 (P1)
      if (allowedEventsP1.includes(selectHandEvent.name)) {
        eventManager.emit(
          selectHandEvent.name,
          { playerId: 1, targetId: 2 }, // P1 escolhe trocar com P3 (index 2)
          p1,
        );
      }
    });

    // 2. Executando a ação: P1 joga a carta 7
    await playCardEvent.action(
      state,
      eventManager,
      { cardId: 100, playerId: 1, saidUno: true },
      p1,
    );

    // 3. Asserções do Estado do Jogo:
    expect(deckState.topDiscard).toBe(sevenCard);

    // A mão remanescente de P1 ([RED_3]) foi trocada com a do P3 ([RED_6])
    expect(p1.hand.length).toBe(1);
    expect(p1.hand[0]).toBe(p3Card);

    expect(p3.hand.length).toBe(1);
    expect(p3.hand[0]).toBe(p1Card);

    // O turno final deve avançar para P2
    expect(state.room.turn.currentPlayer.value).toBe(p2);

    // 4. Asserções das Emissões de Eventos (Rede):
    // Deve ter emitido o EFFECT_CHOOSE comunicando a escolha do P1 (pode ter o prefixo BROADCAST:)
    const chooseEmitted = emitSpy.mock.calls.some((args: any) => {
      const event = args[0] as VoidServerEvent<any>;
      return event.name.endsWith(EFFECT_CHOOSE) && event.data.targetId === 2;
    });
    expect(chooseEmitted).toBe(true);

    // Deve ter emitido o HAND_CHANGED comunicando as trocas de mãos para toda a mesa
    const handChangedEmitted = emitSpy.mock.calls.some((args: any) => {
      const event = args[0] as HandChanged;
      return (
        event.name === "HAND_CHANGED" &&
        event.data.playerId === 1 &&
        event.data.targetId === 2
      );
    });
    expect(handChangedEmitted).toBe(true);

    // Deve ter emitido NEW_HAND para os dois envolvidos (P1 e P3)
    const newHandEvents = emitSpy.mock.calls
      .map((args: any) => args[0])
      .filter((e: any) => e.name === "NEW_HAND");
    expect(newHandEvents.length).toBe(2);
    expect(newHandEvents.some((e: any) => e.data.playerId === 1)).toBe(true);
    expect(newHandEvents.some((e: any) => e.data.playerId === 3)).toBe(true);
  });

  test("deve gerenciar interações com Jump-In de Sete (recebe mão sem outro 7)", async () => {
    // 1. Configurando 4 jogadores (P1, P2, P3, P4)
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const p3 = createMockPlayer(3);
    const p4 = createMockPlayer(4);

    // Ambas devem ter o mesmo nome "BLUE_7"
    const sevenCard1 = create7(configs, 100, COLOR.BLUE, "BLUE_7");
    p1.hand = [sevenCard1];

    const sevenCard2 = create7(configs, 300, COLOR.BLUE, "BLUE_7");
    p3.hand = [sevenCard2];

    p2.hand = [createMockCard(200, Type.NUMBERED, COLOR.RED, 5)];
    p4.hand = [createMockCard(400, Type.NUMBERED, COLOR.RED, 6)];

    const turnState = createMockTurnState([p1, p2, p3, p4]);
    const deckState = createMockDeckState(
      [],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 2),
    );
    deckState.wholeDeck = [];
    deckState.wholeDeck[100] = sevenCard1;
    deckState.wholeDeck[300] = sevenCard2;

    const state = createMockState([p1, p2, p3, p4], deckState, turnState);
    const eventManager = new DefautlEventManager(state);

    eventManager.on(jumpInEvent.name, (data: any, player: any) => {
      jumpInEvent.action(state, eventManager, data, player);
    });

    const emitSpy = vi.spyOn(eventManager, "emitToClient");
    const { whenDone } = setupControlledWaitForEvent(eventManager, state, [
      { action: "wait" }, // JUMP_IN
      { action: "wait" }, // SELECT_HAND
      { action: "wait" }, // Bloqueio do turno final
    ]);

    eventManager.on("PERMISSIONS", (e: PermissionsEvent) => {
      const allowedEventsP3 = e.data.allowedEvents[3] || [];

      if (allowedEventsP3.includes(jumpInEvent.name)) {
        if (p3.hand.some((c) => c.id === 300)) {
          eventManager.emit(
            jumpInEvent.name,
            { cardJumpedId: 300, targetId: 100, playerId: 3 },
            p3,
          );
        }
      }

      if (allowedEventsP3.includes(selectHandEvent.name)) {
        eventManager.emit(
          selectHandEvent.name,
          { playerId: 3, targetId: 1 }, // P3 escolhe trocar com P2 (index 1)
          p3,
        );
      }
    });

    // 2. Executando a jogada
    await playCardEvent.action(
      state,
      eventManager,
      { cardId: 100, playerId: 1, saidUno: true },
      p1,
    );

    // Aguarda o término de todas as promises soltas
    await whenDone;

    // 3. Asserções do Estado do Jogo:
    expect(p1.hand.length).toBe(0);
    expect(deckState.topDiscard).toBe(sevenCard2);

    // As mãos de P3 e P2 devem estar trocadas
    // P3 jogou o 7 e trocou a mão vazia com P2 (que tinha RED_5)
    // Logo P3 ficou com [RED_5] (1 carta) e P2 com a mão vazia de P3
    expect(p3.hand.length).toBe(1);
    expect(p2.hand.length).toBe(0);

    // Turno deve ir para o jogador à direita de P3 (que é P4)
    expect(state.room.turn.currentPlayer.value).toBe(p4);
  });
});
