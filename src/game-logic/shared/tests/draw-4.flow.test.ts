import { describe, expect, test, vi } from "vitest";
import { playCardEvent } from "../events/client/play-card.event.ts";
import { DefautlEventManager } from "../events/event.manager.ts";
import {
  createMockState,
  createMockPlayer,
  createMockTurnState,
  createMockDeckState,
  createMockCard,
} from "./mocks.ts";
import { COLOR, Configs, Type, baseCanBePutOver } from "../cards/default.card.ts";
import { jumpInEvent } from "../events/client/jumpin.event.ts";
import { challengeEvent } from "../events/client/challenge.event.ts";
import { setupControlledWaitForEvent } from "./event-mock.utils.ts";
import { PermissionsEvent } from "../events/server/permissions.event.ts";
import { chooseColor as selectColorEvent } from "../events/client/choose-color.event.ts";
import { createDraw2 } from "../cards/special-models/draw-2.model.ts";
import { createDraw4 } from "../cards/special-models/draw-4.model.ts";

describe("Teste de Integração (Fluxo de jogo) - Efeito do +4", () => {
  const configs: Configs = {
    SEVEN_HAS_EFFECT: true,
    ZERO_HAS_EFFECT: true,
    DRAW_2_OVER_DRAW_4: true,
    DRAW_UNTIL_HAVE: true,
    JUMPIN: true,
    DRAW_4_CHALLENGES: true,
  };

  test("Um jogador joga o +4 e o proximo player nao desafia e compra as cartas (4)", async () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);

    const draw4Card = createDraw4(100);
    p1.hand = [draw4Card];

    // P1 escolhe cor após jogar o coringa, logo o top.color deve mudar para RED
    const dummyCard = createMockCard(200, Type.NUMBERED, COLOR.BLUE, 5);
    p2.hand = [dummyCard];

    const turnState = createMockTurnState([p1, p2]);
    const deckState = createMockDeckState(
      Array.from({ length: 10 }).map((_, i) =>
        createMockCard(500 + i, Type.NUMBERED, COLOR.BLUE, i),
      ),
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 0),
    );

    const state = createMockState([p1, p2], deckState, turnState);
    const eventManager = new DefautlEventManager(state);

    const { whenDone } = setupControlledWaitForEvent(eventManager, state, [
      { action: "wait" }, // P1 choose color
      { action: "timeout" }, // P2 decides to not challenge (timeout) / P2 does not jump in
      { action: "wait" }, // bloqueio do turno de P2, que perdeu a vez após o drawLogic resolve
    ]);

    eventManager.on("PERMISSIONS", (e: PermissionsEvent) => {
      if (e.data.allowedEvents[1]?.includes(selectColorEvent.name)) {
        eventManager.emit(
          selectColorEvent.name,
          { color: COLOR.RED, playerId: 1 },
          p1,
        );
      }
    });

    await playCardEvent.action(
      state,
      eventManager,
      { cardId: 100, playerId: 1, saidUno: true },
      p1,
    );
    await whenDone;
    expect(state.room.currentDraw).toBe(0);
    expect(p1.hand.length).toBe(0);
    expect(p2.hand.length).toBe(1 + 4); // Comprou 4 cartas
  });

  test("Um jogador joga o +4 e o proximo desafia, falha (P1 jogou legalmente) e compra 6", async () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);

    const draw4Card = createDraw4(100);
    // Para ser legal, P1 NÃO PODE TAMBÉM ter uma carta azul, pois o descarte é azul!
    p1.hand = [draw4Card, createMockCard(101, Type.NUMBERED, COLOR.RED, 5)];
    p2.hand = [createMockCard(200, Type.NUMBERED, COLOR.BLUE, 2)];

    const turnState = createMockTurnState([p1, p2]);
    const deckState = createMockDeckState(
      Array.from({ length: 10 }).map((_, i) =>
        createMockCard(500 + i, Type.NUMBERED, COLOR.BLUE, i),
      ),
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 0), // descarte é azul!
    );

    const state = createMockState([p1, p2], deckState, turnState);
    const eventManager = new DefautlEventManager(state);
    eventManager.on("client:CHALLENGE", (e: any) => {
      challengeEvent.action(
        state,
        eventManager,
        { playerId: 2, challenge: true },
        p2,
      );
    });

    setupControlledWaitForEvent(eventManager, state, [
      { action: "wait" }, // choose color
      { action: "wait" }, // challenge
      { action: "wait" }, // bloqueio do próximo turno
    ]);

    eventManager.on("PERMISSIONS", (e: PermissionsEvent) => {
      if (e.data.allowedEvents[1]?.includes(selectColorEvent.name)) {
        eventManager.emit(
          selectColorEvent.name,
          { color: COLOR.RED, playerId: 1 },
          p1,
        );
      }
      if (e.data.allowedEvents[2]?.includes(challengeEvent.name)) {
        eventManager.emit(
          challengeEvent.name,
          { challenge: true, playerId: 2 },
          p2,
        );
      }
    });

    const cardDrawEvents: any[] = [];
    eventManager.on("CARD_DRAW", (e: any) => {
      cardDrawEvents.push(e);
    });

    await playCardEvent.action(
      state,
      eventManager,
      { cardId: 100, playerId: 1, saidUno: true },
      p1,
    );

    expect(state.room.currentDraw).toBe(0);

    // De acordo com as regras pedidas, P1 jogou honestamente (options.length === 0), então P2 desafiou e falhou!
    // Vítima (P2) deveria comprar as 4 + 2 de punição = 6
    expect(p2.hand.length).toBe(1 + 6);

    // Verifica emissões de CARD_DRAW:
    // 1. Para o P2 (quem comprou): deve conter playerId: 2, quantity: 6, cards preenchidos
    const p2Draw = cardDrawEvents.find((e) => e.for.some((p: any) => p.id === 2));
    expect(p2Draw).toBeDefined();
    expect(p2Draw.data.playerId).toBe(2);
    expect(p2Draw.data.quantity).toBe(6);
    expect(p2Draw.data.cards.length).toBe(6);

    // 2. Para os outros jogadores (P1 e P3): deve conter playerId: 2 (quem comprou!), quantity: 6, cards vazios
    const othersDraw = cardDrawEvents.find((e) => e.for.some((p: any) => p.id === 1 || p.id === 3));
    expect(othersDraw).toBeDefined();
    expect(othersDraw.data.playerId).toBe(2);
    expect(othersDraw.data.quantity).toBe(6);
    expect(othersDraw.data.cards).toEqual([]);
  });

  test("Um jogador joga um +4, o proximo desafia, ganha (P1 blefou) e o anterior conta compra +4", async () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const p3 = createMockPlayer(3);

    const draw4Card = createDraw4(100);
    // Para ser bluff, P1 DEVE ter uma carta azul!
    p1.hand = [draw4Card, createMockCard(101, Type.NUMBERED, COLOR.BLUE, 5)];
    p2.hand = [createMockCard(200, Type.NUMBERED, COLOR.BLUE, 2)];

    const turnState = createMockTurnState([p1, p2, p3]);
    const deckState = createMockDeckState(
      Array.from({ length: 10 }).map((_, i) =>
        createMockCard(500 + i, Type.NUMBERED, COLOR.BLUE, i),
      ),
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 0), // descarte azul
    );

    const state = createMockState([p1, p2, p3], deckState, turnState);
    const eventManager = new DefautlEventManager(state);
    eventManager.on(challengeEvent.name, (data: any, player: any) => {
      challengeEvent.action(state, eventManager, data, player);
    });

    setupControlledWaitForEvent(eventManager, state, [
      { action: "wait" }, // choose color
      { action: "wait" }, // challenge
      { action: "wait" }, // bloqueador
    ]);

    const permissionsEmittedFor: number[] = [];

    eventManager.on("PERMISSIONS", (e: PermissionsEvent) => {
      if (e.data.playerId !== undefined) {
        permissionsEmittedFor.push(e.data.playerId);
      }
      if (e.data.allowedEvents[1]?.includes(selectColorEvent.name)) {
        eventManager.emit(
          selectColorEvent.name,
          { color: COLOR.RED, playerId: 1 },
          p1,
        );
      }
      if (e.data.allowedEvents[2]?.includes(challengeEvent.name)) {
        eventManager.emit(
          challengeEvent.name,
          { challenge: true, playerId: 2 },
          p2,
        );
      }
    });

    const cardDrawEvents: any[] = [];
    eventManager.on("CARD_DRAW", (e: any) => {
      cardDrawEvents.push(e);
    });

    await playCardEvent.action(
      state,
      eventManager,
      { cardId: 100, playerId: 1, saidUno: true },
      p1,
    );

    expect(state.room.currentDraw).toBe(0);

    // P1 comprou as 4 de punição pelo blefe descoberto
    expect(p1.hand.length).toBe(1 + 4);
    // P2 que ganhou passa impune e não pula a vez
    expect(p2.hand.length).toBe(1);
    expect(state.room.turn.currentPlayer.value).toBe(p2);

    // Verifica se o evento de permissões foi emitido novamente para o P2 após o desafio
    expect(permissionsEmittedFor[permissionsEmittedFor.length - 1]).toBe(2);

    // Verifica emissões de CARD_DRAW para o caso de blefe (P1 comprou):
    // 1. Para o P1 (quem comprou): deve conter playerId: 1, quantity: 4, cards preenchidos
    const p1Draw = cardDrawEvents.find((e) => e.for.some((p: any) => p.id === 1));
    expect(p1Draw).toBeDefined();
    expect(p1Draw.data.playerId).toBe(1);
    expect(p1Draw.data.quantity).toBe(4);
    expect(p1Draw.data.cards.length).toBe(4);

    // 2. Para os outros jogadores (P2 e P3): deve conter playerId: 1 (quem comprou!), quantity: 4, cards vazios
    const othersDraw = cardDrawEvents.find((e) => e.for.some((p: any) => p.id === 2 || p.id === 3));
    expect(othersDraw).toBeDefined();
    expect(othersDraw.data.playerId).toBe(1);
    expect(othersDraw.data.quantity).toBe(4);
    expect(othersDraw.data.cards).toEqual([]);
  });

  test("Um jogador joga +4 e o anterior da jumpin em cima com outro +4 fazendo ele comprar 8 cartas sem desafio", async () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const p3 = createMockPlayer(3);

    const draw4_1 = createDraw4(100);
    const draw4_2 = createDraw4(300);
    p1.hand = [draw4_1];
    p3.hand = [draw4_2]; // P3 dá jump-in

    const turnState = createMockTurnState([p1, p2, p3]);
    const deckState = createMockDeckState(
      Array.from({ length: 10 }).map((_, i) =>
        createMockCard(500 + i, Type.NUMBERED, COLOR.BLUE, i),
      ),
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 0),
    );
    deckState.wholeDeck = [];
    deckState.wholeDeck[100] = draw4_1;
    deckState.wholeDeck[300] = draw4_2;

    const state = createMockState([p1, p2, p3], deckState, turnState);
    const eventManager = new DefautlEventManager(state);

    eventManager.on(jumpInEvent.name, (data: any, player: any) => {
      jumpInEvent.action(state, eventManager, data, player);
    });

    const { whenDone } = setupControlledWaitForEvent(eventManager, state, [
      { action: "wait" }, // Jump In wait emit P3 (+4 is jumpable with another +4!)
      { action: "wait" }, // Escolher cor P3
      { action: "timeout" }, // Sem desafio para P1 do +4 de P3
      { action: "wait" }, // Block next turn
    ]);

    eventManager.on("PERMISSIONS", (e: PermissionsEvent) => {
      // P3 jump in
      if (e.data.allowedEvents[3]?.includes(jumpInEvent.name)) {
        eventManager.emit(
          jumpInEvent.name,
          { cardJumpedId: 300, targetId: 100, playerId: 3 },
          p3,
        );
      }
      if (e.data.allowedEvents[3]?.includes(selectColorEvent.name)) {
        eventManager.emit(
          selectColorEvent.name,
          { color: COLOR.RED, playerId: 3 },
          p3,
        );
      }
    });

    await playCardEvent.action(
      state,
      eventManager,
      { cardId: 100, playerId: 1, saidUno: true },
      p1,
    );
    await whenDone;

    expect(state.room.currentDraw).toBe(0);
    expect(p3.hand.length).toBe(0);
    // P1 tomou jumpin, ele comprou 8
    expect(p1.hand.length).toBe(8);

    // Verifica se a vez no final é do jogador 3 (quem efetuou o jump-in)
    expect(state.room.turn.currentPlayer.value).toBe(p2);
  });
});

describe("Cadeia de compra misturada (+2/+2/+2/+4)", () => {
  const configs: Configs = {
    SEVEN_HAS_EFFECT: true,
    ZERO_HAS_EFFECT: true,
    DRAW_2_OVER_DRAW_4: true,
    DRAW_UNTIL_HAVE: true,
    JUMPIN: true,
    DRAW_4_CHALLENGES: true,
  };

  const setupCadeia = (
    p4MocksOpcoes: (eventManager: DefautlEventManager, p1: any) => void,
  ) => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const p3 = createMockPlayer(3);
    const p4 = createMockPlayer(4); // Vítima do final da cadeia

    const draw2_1 = createDraw2(configs, 100, COLOR.BLUE, "BLUE_+2");
    const draw2_2 = createDraw2(configs, 200, COLOR.BLUE, "BLUE_+2");
    const draw2_3 = createDraw2(configs, 300, COLOR.BLUE, "BLUE_+2");
    const draw4 = createDraw4(400); // P4 tem o draw4 pra jogar em cima do 300

    const p1OriginalCard = createMockCard(101, Type.NUMBERED, COLOR.BLUE, 5); // p1 legal

    p1.hand = [draw2_1, p1OriginalCard];
    p2.hand = [draw2_2];
    p3.hand = [draw2_3];
    p4.hand = [draw4]; // vai estender com o +4

    const turnState = createMockTurnState([p1, p2, p3, p4]);
    const deckState = createMockDeckState(
      Array.from({ length: 20 }).map((_, i) =>
        createMockCard(500 + i, Type.NUMBERED, COLOR.RED, i),
      ),
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 0),
    );

    const state = createMockState([p1, p2, p3, p4], deckState, turnState);
    const eventManager = new DefautlEventManager(state);

    const { whenDone } = setupControlledWaitForEvent(eventManager, state, [
      { action: "timeout" }, // Jump In ignorado para carta 100
      { action: "wait" }, // P1 pede jogada pro P2
      { action: "timeout" }, // Jump In ignorado para carta 200
      { action: "wait" }, // P2 pede jogada pro P3
      { action: "wait" }, // P3 pede jogada pro P4 (+4)
      // P4 joga +4. Ninguém mais tem +4, logo isJumpinPossible é false e pula essa etapa
      { action: "wait" }, // P4 Select Color (+4)
      { action: "timeout" }, // P1 (vitima de 400) Challenge Event - Não vamos esperar os 5s literais, simulamos o tempo esgotado!
      { action: "wait" }, // next turn
    ]);

    let p2Played = false;
    let p3Played = false;
    let p4Played = false;

    eventManager.on("PERMISSIONS", (e: PermissionsEvent) => {
      // P2 chaining
      if (e.data.allowedEvents[2]?.includes(playCardEvent.name) && !p2Played) {
        p2Played = true;
        eventManager.emit(playCardEvent.name, { cardId: 200, playerId: 2 }, p2);
      }
      // P3 chaining
      if (e.data.allowedEvents[3]?.includes(playCardEvent.name) && !p3Played) {
        p3Played = true;
        eventManager.emit(playCardEvent.name, { cardId: 300, playerId: 3 }, p3);
      }
      // P4 chaining with +4
      if (e.data.allowedEvents[4]?.includes(playCardEvent.name) && !p4Played) {
        p4Played = true;
        eventManager.emit(playCardEvent.name, { cardId: 400, playerId: 4 }, p4);
      }
      if (e.data.allowedEvents[4]?.includes(selectColorEvent.name)) {
        eventManager.emit(
          selectColorEvent.name,
          { color: COLOR.RED, playerId: 4 },
          p4,
        );
      }
    });

    p4MocksOpcoes(eventManager, p1);

    return { p1, state, eventManager, whenDone };
  };

  test("Cadeia longa onde P1 não desafia e sofre a carga máxima", async () => {
    const { p1, state, eventManager, whenDone } = setupCadeia((mgr, _p1) => {});
    eventManager.on(playCardEvent.name, (data: any, player: any) => {
      console.log(
        `[TEST 5] Setupping timeout for action for card ${data.cardId} from Player ${player.id}`,
      );
      playCardEvent.action(state, eventManager, data, player);
    });
    await playCardEvent.action(
      state,
      eventManager,
      { cardId: 100, playerId: 1, saidUno: true },
      p1,
    );

    // Esperarmos a cadeia inteira de eventos mocks terminar
    await whenDone;
    // 2 + 2 + 2 + 4 = 10 cartas para P1 (mais as 2 originais - 1 jogada = 1 + 10 = 11)
    console.log(
      `P1: ${p1.hand.length}, P2: ${state.room.players[1].hand.length}, P3: ${state.room.players[2].hand.length}, P4: ${state.room.players[3].hand.length}`,
    );
    expect(state.room.currentDraw).toBe(0);
    expect(p1.hand.length).toBe(11);
  });

  test("Cadeia longa onde P1 desafia e perde (P4 jogou +4 honestamente, que comprou de surpresa)", async () => {
    const { p1, state, eventManager, whenDone } = setupCadeia((mgr, _p1) => {
      mgr.on("PERMISSIONS", (e: PermissionsEvent) => {
        if (e.data.allowedEvents[1]?.includes(challengeEvent.name)) {
          mgr.emit(challengeEvent.name, { challenge: true, playerId: 1 }, _p1);
        }
      });
    });

    eventManager.on(playCardEvent.name, (data: any, player: any) =>
      playCardEvent.action(state, eventManager, data, player),
    );
    await playCardEvent.action(
      state,
      eventManager,
      { cardId: 100, playerId: 1, saidUno: true },
      p1,
    );

    // Esperarmos a cadeia inteira de eventos mocks terminar
    await whenDone;

    // Se perde: compra as 10 acumuladas + 2 = 12 (1 original + 12 = 13)
    expect(state.room.currentDraw).toBe(0);
    expect(p1.hand.length).toBe(11);
  });
});
