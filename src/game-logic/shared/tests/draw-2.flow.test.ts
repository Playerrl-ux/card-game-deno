import { describe, expect, test, vi } from "vitest";
import { playCardEvent } from "../events/client/play-card.event.ts";
import { DefautlEventManager } from "../events/event.manager.ts";
import { drawChoiceEvent, keepEvent } from "../events/client/draw.choice.event.ts";
import {
  createMockState,
  createMockPlayer,
  createMockTurnState,
  createMockDeckState,
  createMockCard,
} from "./mocks.ts";
import { COLOR, Configs, Type } from "../cards/default.card.ts";
import { jumpInEvent } from "../events/client/jumpin.event.ts";
import { setupControlledWaitForEvent } from "./event-mock.utils.ts";
import { createDraw2 } from "../cards/special-models/draw-2.model.ts";
import { PermissionsEvent } from "../events/server/permissions.event.ts";

describe("Teste de Integração (Fluxo de jogo) - Efeito do +2", () => {
  const configs: Configs = {
    SEVEN_HAS_EFFECT: true,
    ZERO_HAS_EFFECT: true,
    DRAW_2_OVER_DRAW_4: true,
    DRAW_UNTIL_HAVE: true,
    JUMPIN: true,
    DRAW_4_CHALLENGES: true,
  };

  test("Um jogador joga o +2 e o proximo player compra 2 cartas", async () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const p3 = createMockPlayer(3);

    const draw2Card = createDraw2(configs, 100, COLOR.BLUE, "BLUE_+2");
    p1.hand = [draw2Card];

    // P2 tem cartas normais
    p2.hand = [createMockCard(200, Type.NUMBERED, COLOR.RED, 5)];
    p3.hand = [createMockCard(300, Type.NUMBERED, COLOR.RED, 6)];

    const turnState = createMockTurnState([p1, p2, p3]);
    const deckState = createMockDeckState(
      [
        createMockCard(501, Type.NUMBERED, COLOR.BLUE, 1),
        createMockCard(502, Type.NUMBERED, COLOR.BLUE, 2),
      ],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 0),
    );

    const state = createMockState([p1, p2, p3], deckState, turnState);
    const eventManager = new DefautlEventManager(state);

    // Sem jump-in, o p2 não tem +2 então não espera nada no drawLogic,
    // logo só precisamos esperar o final para o P3!
    const { whenDone } = setupControlledWaitForEvent(eventManager, state, [
      { action: "wait" }, // trava do turno final do P3
    ]);

    await playCardEvent.action(
      state,
      eventManager,
      { cardId: 100, playerId: 1 },
      p1,
    );

    await whenDone;

    // O currentDraw deve ter sido resetado
    expect(state.room.currentDraw).toBe(0);

    // O topo do descarte é o +2
    expect(deckState.topDiscard).toBe(draw2Card);

    // P1 ficou com 0 cartas
    expect(p1.hand.length).toBe(0);

    // P2 comprou 2 cartas! Ele tinha 1, agora tem 3.
    expect(p2.hand.length).toBe(3);

    // O turno avança para P3
    expect(state.room.turn.currentPlayer.value).toBe(p3);
  });

  test("Um jogador joga +2 e o anterior da jumpin em cima com outro +2 fazendo ele comprar 4 cartas", async () => {
    // 4 jogadores
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const p3 = createMockPlayer(3);
    const p4 = createMockPlayer(4); // P4 é o anterior ao P1

    const draw2_1 = createDraw2(configs, 100, COLOR.BLUE, "BLUE_+2");
    p1.hand = [draw2_1];

    const draw2_2 = createDraw2(configs, 400, COLOR.BLUE, "BLUE_+2");
    p4.hand = [draw2_2];

    p2.hand = [createMockCard(200, Type.NUMBERED, COLOR.RED, 5)];
    p3.hand = [createMockCard(300, Type.NUMBERED, COLOR.RED, 6)];

    const turnState = createMockTurnState([p1, p2, p3, p4]);
    const deckState = createMockDeckState(
      [
        createMockCard(501, Type.NUMBERED, COLOR.BLUE, 1),
        createMockCard(502, Type.NUMBERED, COLOR.BLUE, 2),
        createMockCard(503, Type.NUMBERED, COLOR.BLUE, 3),
        createMockCard(504, Type.NUMBERED, COLOR.BLUE, 4),
      ],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 0),
    );
    deckState.wholeDeck = [];
    deckState.wholeDeck[100] = draw2_1;
    deckState.wholeDeck[400] = draw2_2;

    const state = createMockState([p1, p2, p3, p4], deckState, turnState);
    const eventManager = new DefautlEventManager(state);

    eventManager.on(jumpInEvent.name, (data: any, player: any) => {
      jumpInEvent.action(state, eventManager, data, player);
    });

    const { whenDone } = setupControlledWaitForEvent(eventManager, state, [
      { action: "wait" }, // wait pro P4 pular (na 1ª checagem)
      { action: "wait" }, // bloqueador de turno de P2 que será o próximo após o turno de P4
    ]);

    eventManager.on("PERMISSIONS", (e: PermissionsEvent) => {
      if (e.data.allowedEvents[4]?.includes("client:JUMP_IN")) {
        eventManager.emit(
          jumpInEvent.name,
          { cardJumpedId: 400, targetId: 100, playerId: 4 },
          p4,
        );
      }
    });

    await playCardEvent.action(
      state,
      eventManager,
      { cardId: 100, playerId: 1 },
      p1,
    );

    // wait for detached jump-in promise
    await whenDone;

    expect(state.room.currentDraw).toBe(0);
    expect(deckState.topDiscard).toBe(draw2_2);

    expect(p1.hand.length).toBe(4); // P1 foi a vítima do Jump-In do P4, comprou 4! (0 original da play + 4 comprou)
    expect(p4.hand.length).toBe(0); // P4 jogou jump in

    // Turno avança pra P2 (já que o jumpin do P4 foi engolido pelo P1)
    expect(state.room.turn.currentPlayer.value).toBe(p2);
  });

  test("Um jogador sofre o +2, tem outro +2 na mão para rebater, mas emite voluntariamente DRAW_CHOICE para aceitar a punição e comprar as cartas", async () => {
    const localConfigs: Configs = {
      ...configs,
      JUMPIN: false,
    };
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const p3 = createMockPlayer(3);

    const draw2Card = createDraw2(localConfigs, 100, COLOR.BLUE, "BLUE_+2");
    p1.hand = [draw2Card];

    // P2 tem um +2 para rebater, mas escolherá comprar voluntariamente
    const p2Draw2 = createDraw2(localConfigs, 200, COLOR.RED, "RED_+2");
    p2.hand = [p2Draw2];
    p3.hand = [createMockCard(300, Type.NUMBERED, COLOR.RED, 6)];

    const turnState = createMockTurnState([p1, p2, p3]);
    const deckState = createMockDeckState(
      [
        createMockCard(501, Type.NUMBERED, COLOR.BLUE, 1),
        createMockCard(502, Type.NUMBERED, COLOR.BLUE, 2),
      ],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 0),
    );

    const state = createMockState([p1, p2, p3], deckState, turnState);
    state.configs = localConfigs;
    const eventManager = new DefautlEventManager(state);

    // Registra o tratador para processar quando o evento de DRAW_CHOICE for recebido
    eventManager.on("client:DRAW_CHOICE", (data: any, player: any) => {
      drawChoiceEvent.action(state, eventManager, data, player);
    });

    const { whenDone } = setupControlledWaitForEvent(eventManager, state, [
      { action: "wait" }, // P2 escolhe comprar voluntariamente durante o drawLogic (espera DRAW_CHOICE)
      { action: "wait" }, // bloqueio do turno de P3 que é o próximo
    ]);

    eventManager.on("PERMISSIONS", (e: PermissionsEvent) => {
      // Quando P2 receber as permissões contendo DRAW_CHOICE, emite o evento
      if (
        e.data.playerId === 2 &&
        e.data.allowedEvents[2]?.includes("client:DRAW_CHOICE")
      ) {
        eventManager.emit("client:DRAW_CHOICE", { playerId: 2 }, p2);
      }
    });

    await playCardEvent.action(
      state,
      eventManager,
      { cardId: 100, playerId: 1 },
      p1,
    );

    await whenDone;

    // A cadeia de compra deve ter sido resolvida e zerada
    expect(state.room.currentDraw).toBe(0);
    // P2 comprou as 2 cartas (tinha 1, agora tem 3)
    expect(p2.hand.length).toBe(3);
    // O turno foi passado para o P3
    expect(state.room.turn.currentPlayer.value).toBe(p3);
  });

  test("Um jogador inicia seu turno e decide comprar uma carta voluntariamente por que quis", async () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);

    // P1 tem uma carta vermelha (incompatível)
    const p1Card = createMockCard(100, Type.NUMBERED, COLOR.RED, 3);
    p1.hand = [p1Card];
    p2.hand = [createMockCard(200, Type.NUMBERED, COLOR.RED, 5)];

    const turnState = createMockTurnState([p1, p2]);
    // Topo do descarte é Azul. No deck temos um Azul 9 compatível.
    const deckState = createMockDeckState(
      [createMockCard(300, Type.NUMBERED, COLOR.BLUE, 9)],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 5),
    );

    const state = createMockState([p1, p2], deckState, turnState);
    const eventManager = new DefautlEventManager(state);

    eventManager.on("client:DRAW_CHOICE", (data: any, player: any) => {
      drawChoiceEvent.action(state, eventManager, data, player);
    });

    eventManager.on("client:KEEP_EVENT", (data: any, player: any) => {
      keepEvent.action(state, eventManager, data, player);
    });

    const { spy, whenDone } = setupControlledWaitForEvent(eventManager, state, [
      { action: "wait" }, // espera do DRAW_CHOICE / PLAY_CARD inicial de P1
      { action: "wait" }, // espera do KEEP / PLAY da carta de escolha (ChooseEvent)
      { action: "wait" }, // bloqueio do turno de P2 após P1 escolher KEEP
    ]);

    let drawChoiced = false;
    eventManager.on("PERMISSIONS", (e: PermissionsEvent) => {
      if (e.data.playerId === 1) {
        // Primeira permissão: tem permissão de escolher comprar
        if (
          e.data.allowedEvents[1]?.includes("client:DRAW_CHOICE") &&
          !drawChoiced
        ) {
          drawChoiced = true;
          eventManager.emit("client:DRAW_CHOICE", { playerId: 1 }, p1);
        }
        // Segunda permissão: tem permissão de KEEP após comprar carta jogável
        else if (e.data.allowedEvents[1]?.includes("client:KEEP_EVENT")) {
          eventManager.emit("client:KEEP_EVENT", { playerId: 1 }, p1);
        }
      }
    });

    // Inicia o turno mudando para P1 e rodando o changeTurn inicial
    eventManager.changeTurn();

    await whenDone;

    // P1 comprou a carta (tinha 1, comprou 1, agora tem 2)
    expect(p1.hand.length).toBe(2);
    expect(p1.hand[1].id).toBe(300); // Azul 9 comprada
    // O turno passou para P2 após o KEEP
    expect(state.room.turn.currentPlayer.value).toBe(p2);
  });
});
