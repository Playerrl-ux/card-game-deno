import { describe, expect, test, vi } from "vitest";
import { playCardEvent } from "../events/client/play-card.event.ts";
import { create0 } from "../cards/special-models/zero.model.ts";
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
import { NewHandEvent } from "../events/server/new-hand.event.ts";
import {
  setupMockTimeoutResolution,
  setupControlledWaitForEvent,
} from "./event-mock.utils.ts";
import { jumpInEvent } from "../events/client/jumpin.event.ts";
import { ServerEventPayloads } from "../events/server/server-payloads.ts";

describe("Teste de Integração (Fluxo de jogo) - Efeito do Zero", () => {
  const configs: Configs = {
    SEVEN_HAS_EFFECT: true,
    ZERO_HAS_EFFECT: true, // Habilita o efeito do 0
    DRAW_2_OVER_DRAW_4: true,
    DRAW_UNTIL_HAVE: true,
    JUMPIN: true,
    DRAW_4_CHALLENGES: true,
  };

  test("deve rotacionar as mãos de todos os jogadores de acordo com o sentido ao jogar a carta 0", async () => {
    // 1. Configurando o cenário: 3 jogadores (P1, P2, P3)
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const p3 = createMockPlayer(3);

    // Mãos iniciais
    const zeroCard = create0(configs, 100, COLOR.BLUE, "BLUE_0");
    const p1Card = createMockCard(101, Type.NUMBERED, COLOR.RED, 3);
    p1.hand = [zeroCard, p1Card]; // Mão de P1: [BLUE_0, RED_3]

    // Mão de P2: [RED_5]
    const p2Card = createMockCard(200, Type.NUMBERED, COLOR.RED, 5);
    p2.hand = [p2Card];

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
    setupMockTimeoutResolution(eventManager, state);

    // 2. Executando a ação: P1 joga a carta 0
    await playCardEvent.action(
      state,
      eventManager,
      { cardId: 100, playerId: 1, saidUno: true },
      p1,
    );

    // 3. Asserções do Estado do Jogo:
    // A carta 0 deve ter sido retirada e colocada no monte de descarte
    expect(deckState.topDiscard).toBe(zeroCard);

    // As mãos devem ter rotacionado (P1 passa para P2 sua mão remanescente [RED_3], P2 passa para P3 [RED_5], P3 passa para P1 [RED_6])
    expect(p1.hand.length).toBe(1);
    expect(p1.hand[0]).toBe(p3Card); // P1 recebeu a mão de P3

    expect(p2.hand.length).toBe(1);
    expect(p2.hand[0]).toBe(p1Card); // P2 recebeu a mão remanescente de P1

    expect(p3.hand.length).toBe(1);
    expect(p3.hand[0]).toBe(p2Card); // P3 recebeu a mão de P2

    // O jogador atual deve ser P2 (turno seguiu normal)
    expect(state.room.turn.currentPlayer.value).toBe(p2);

    // 4. Asserções das Emissões de Eventos (Rede):
    // Deve ter emitido o NEW_HAND event para cada jogador comunicando as novas mãos
    const newHandEvents = emitSpy.mock.calls.filter((args: any) => {
      const event = args[0] as NewHandEvent;
      return event.name === "NEW_HAND";
    });
    expect(newHandEvents.length).toBe(3);
  });

  test("deve gerenciar interações com Jump-In de Zero sem duplicar (recebe mão sem Zero)", async () => {
    // 1. Configurando 4 jogadores (P1, P2, P3, P4)
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const p3 = createMockPlayer(3);
    const p4 = createMockPlayer(4);

    // P1 joga o primeiro 0
    const zeroCard1 = create0(configs, 100, COLOR.BLUE, "BLUE_0");
    p1.hand = [zeroCard1]; // P1 joga 100

    // Para que P4 receba o 0 azul de Jump-In na primeira rotação síncrona,
    // essa carta (ID 400) deve iniciar originalmente na mão de P3!
    const zeroCard2 = create0(configs, 400, COLOR.BLUE, "BLUE_0");
    p3.hand = [zeroCard2];

    p2.hand = [createMockCard(200, Type.NUMBERED, COLOR.RED, 5)];
    p4.hand = [createMockCard(300, Type.NUMBERED, COLOR.RED, 6)]; // P4 começa com dummy

    const turnState = createMockTurnState([p1, p2, p3, p4]);
    const deckState = createMockDeckState(
      [],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 2),
    );
    deckState.wholeDeck = [];
    deckState.wholeDeck[100] = zeroCard1;
    deckState.wholeDeck[400] = zeroCard2;

    const state = createMockState([p1, p2, p3, p4], deckState, turnState);
    const eventManager = new DefautlEventManager(state);

    eventManager.on(jumpInEvent.name, (data: any, player: any) => {
      jumpInEvent.action(state, eventManager, data, player);
    });

    const emitSpy = vi.spyOn(eventManager, "emitToClient");

    // Controlamos o evento para "esperar" pela nossa emissão manual
    const { whenDone } = setupControlledWaitForEvent(eventManager, state, [
      { action: "wait" },
      { action: "wait" },
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

    // 2. Executando a jogada
    await playCardEvent.action(
      state,
      eventManager,
      { cardId: 100, playerId: 1 },
      p1,
    );

    await whenDone;

    // 3. Asserções do Estado do Jogo:
    expect(p1.hand.length).toBe(0); // Recebeu a mão final de P4 (que ficou vazia pelo descarte da 400)
    expect(deckState.topDiscard).toBe(zeroCard2);

    // O jogador atual após a conclusão do Jump-In de P4 deve ser P1 (pois P1 é o próximo de P4)
    expect(state.room.turn.currentPlayer.value).toBe(p1);
  });

  test("deve permitir duplo Jump-in e dupla rotação se o P1 receber a mão do P4 contendo um 0 da mesma cor", async () => {
    // 1. Configurando 4 jogadores (P1, P2, P3, P4)
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const p3 = createMockPlayer(3);
    const p4 = createMockPlayer(4);

    // Cartas iniciais
    // P1 joga a primeira BLUE_0
    const zeroCard1 = create0(configs, 100, COLOR.BLUE, "BLUE_0");
    const p1Dummy = createMockCard(101, Type.NUMBERED, COLOR.YELLOW, 1);
    p1.hand = [zeroCard1, p1Dummy];

    const p2Dummy = createMockCard(201, Type.NUMBERED, COLOR.YELLOW, 2);
    p2.hand = [p2Dummy];

    const p3Dummy = createMockCard(301, Type.NUMBERED, COLOR.YELLOW, 3);
    p3.hand = [p3Dummy];

    // O 0 azul de Jump-In está na mão de P4 (ID: 400).
    // Quando P1 jogar o zeroCard1(100), as mãos rotacionarão inversamente? Não, sentido normal (Direita).
    // P1 -> P2, P2 -> P3, P3 -> P4, P4 -> P1
    // Assim, P1 assumirá a mão de P4 contendo o zeroCard2(400) e poderá dar Jump-In in si próprio!
    const zeroCard2 = create0(configs, 400, COLOR.BLUE, "BLUE_0");
    const p4Dummy = createMockCard(401, Type.NUMBERED, COLOR.YELLOW, 4);
    p4.hand = [zeroCard2, p4Dummy];

    const turnState = createMockTurnState([p1, p2, p3, p4]);
    const deckState = createMockDeckState(
      [],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 2),
    );
    deckState.wholeDeck = [];
    deckState.wholeDeck[100] = zeroCard1;
    deckState.wholeDeck[400] = zeroCard2;

    const state = createMockState([p1, p2, p3, p4], deckState, turnState);
    const eventManager = new DefautlEventManager(state);

    eventManager.on(jumpInEvent.name, (data: any, player: any) => {
      jumpInEvent.action(state, eventManager, data, player);
    });

    const emitSpy = vi.spyOn(eventManager, "emitToClient");

    // Como o motor agora permite jump-in na própria carta, o JUMP_IN será pedido naturalmente!
    const { whenDone: whenDoneDouble } = setupControlledWaitForEvent(
      eventManager,
      state,
      [{ action: "wait" }, { action: "wait" }],
    );

    eventManager.on("PERMISSIONS", (e: PermissionsEvent) => {
      // Quando o Motor pedir permissão de JUMP_IN, o P1 responde
      if (e.data.allowedEvents[1]?.includes("client:JUMP_IN")) {
        eventManager.emit(
          jumpInEvent.name,
          { cardJumpedId: 400, targetId: 100, playerId: 1 },
          p1,
        );
      }
    });

    // 2. Executando a ação: P1 joga a carta 0
    await playCardEvent.action(
      state,
      eventManager,
      { cardId: 100, playerId: 1, saidUno: true },
      p1,
    );

    // Aguarda o detached jump in do P1 se resolver
    await whenDoneDouble;

    // 3. Asserções do Estado do Jogo:
    expect(p1.hand.includes(zeroCard1)).toBe(false);
    expect(p4.hand.includes(zeroCard2)).toBe(false);
    expect(deckState.topDiscard).toBe(zeroCard2);

    // Mãos finais esperadas pós rotação dupla:
    // Primeira rotação:
    // P1 -> P2: [p1Dummy] (101)
    // P2 -> P3: [p2Dummy] (201)
    // P3 -> P4: [zeroCard2] (400)
    // P4 -> P1: [p4Dummy] (301)
    // Segunda rotação (disparada pelo Jump-In de P4, P4 rotaciona sua mão atual síncronamente):
    // P1 -> P2: [p4Dummy] (301)
    // P2 -> P3: [p1Dummy] (101)
    // P3 -> P4: [p2Dummy] (201)
    // P4 -> P1: P4 jogou o zeroCard2, então a mão de P4 passa vazia para P1!
    // Portanto:
    expect(p1.hand[0].id).toBe(301); // P1 terminou com carta que era do P3!
    expect(p2.hand[0].id).toBe(401); // P2 terminou com carta que era do P4!
    expect(p3.hand[0].id).toBe(101); // P3 terminou com carta que era do P1!
    expect(p4.hand[0].id).toBe(201); // P4 terminou com carta que era do P2!

    // O jogador da vez final agora deve ser P2 (próximo após P1 que jogou o jump-in)
    expect(state.room.turn.currentPlayer.value).toBe(p2);

    // Pelo menos 8 eventos de NEW_HAND devem ter sido disparados (2 rotações de 4 players cada)
    const newHandEvents = emitSpy.mock.calls.filter((args: any) => {
      const event = args[0] as NewHandEvent;
      return event.name === "NEW_HAND";
    });
    expect(newHandEvents.length).toBe(8);
  });

  test("Cenário de investigação: O que acontece se alguém jogar a carta 0 como última carta da mão", async () => {
    // 1. Configurando cenário: P1 só tem a carta 0 na mão
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const p3 = createMockPlayer(3);

    const zeroCard = create0(configs, 100, COLOR.BLUE, "BLUE_0");
    p1.hand = [zeroCard]; // P1 com apenas 1 carta (o zero)

    const p2Card = createMockCard(200, Type.NUMBERED, COLOR.RED, 5);
    p2.hand = [p2Card];

    const p3Card = createMockCard(300, Type.NUMBERED, COLOR.RED, 6);
    p3.hand = [p3Card];

    const turnState = createMockTurnState([p1, p2, p3]);
    const deckState = createMockDeckState(
      [],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 2),
    );
    const state = createMockState([p1, p2, p3], deckState, turnState);
    state.configs.CanWin = true;

    let victoryWinnerId: number | undefined;
    const eventManager = new DefautlEventManager(state, (winnerId) => {
      victoryWinnerId = winnerId;
    });

    const emitSpy = vi.spyOn(eventManager, "emitToClient");
    setupMockTimeoutResolution(eventManager, state);

    const permissionsEvents: PermissionsEvent[] = [];
    eventManager.on("PERMISSIONS", (e: PermissionsEvent) => {
      permissionsEvents.push(e);
    });

    // 2. P1 joga a carta 0 (sua última carta)
    await playCardEvent.action(
      state,
      eventManager,
      { cardId: 100, playerId: 1 },
      p1,
    );

    // 3. Inspeções do comportamento:
    // P1 jogou o 0, sua mão ficou vazia ([]).
    // O effectBefore (zeroSpecialEffect) executou a rotação das mãos antes do checkVictory:
    // - A mão vazia [] de P1 foi dada a P2!
    // - A mão [p2Card] de P2 foi dada a P3!
    // - A mão [p3Card] de P3 foi dada a P1!
    expect(p1.hand.length).toBe(1);
    expect(p1.hand[0].id).toBe(300); // P1 recebeu a mão de P3 e NÃO ficou com mão vazia

    expect(p2.hand.length).toBe(0); // P2 agora está com 0 cartas!
    expect(p3.hand.length).toBe(1);
    expect(p3.hand[0].id).toBe(200);

    // Como checkVictory checa a mão de todos os jogadores, P2 é detectado com 0 cartas e vence o jogo!
    expect(victoryWinnerId).toBe(2);
    expect(state.victoryTriggered).toBe(true);

    // O evento WIN emitido deve ser para P2
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: ServerEventPayloads.WIN.broadcastName,
        for: state.room.players,
      }),
    );
  });
});
