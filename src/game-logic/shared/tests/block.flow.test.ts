import { describe, expect, test, vi } from "vitest";
import { playCardEvent } from "../events/client/play-card.event.ts";
import { createBlock } from "../cards/special-models/block.model.ts";
import { DefautlEventManager } from "../events/event.manager.ts";
import {
  createMockState,
  createMockPlayer,
  createMockTurnState,
  createMockDeckState,
  createMockCard,
} from "./mocks.ts";
import { COLOR, Type } from "../cards/default.card.ts";
import { PermissionsEvent } from "../events/server/permissions.event.ts";
import { VoidServerEvent } from "../events/server/void.events.ts";
import {
  setupMockTimeoutResolution,
  setupControlledWaitForEvent,
} from "./event-mock.utils.ts";
import { jumpInEvent } from "../events/client/jumpin.event.ts";

describe("Teste de Integração (Fluxo de jogo) - Efeito de Bloqueio", () => {
  test("deve pular o próximo jogador (P2) e dar o turno ao terceiro jogador (P3) ao jogar carta Block", async () => {
    // 1. Configurando o cenário: 3 jogadores
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const p3 = createMockPlayer(3);

    // O jogador 1 terá a carta de bloqueio azul na mão
    const blockCard = createBlock(100, COLOR.BLUE, "BLUE_BLOCK");
    p1.hand = [blockCard];

    // O jogador 2 e o jogador 3 têm cartas comuns numeradas (assim o jumpin não será possível)
    p2.hand = [createMockCard(200, Type.NUMBERED, COLOR.RED, 5)];
    p3.hand = [createMockCard(300, Type.NUMBERED, COLOR.RED, 6)];

    const turnState = createMockTurnState([p1, p2, p3]);
    const deckState = createMockDeckState(
      [],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 2),
    );
    const state = createMockState([p1, p2, p3], deckState, turnState);
    const eventManager = new DefautlEventManager(state);

    // Espionamos as chamadas de emissão para o cliente
    const emitSpy = vi.spyOn(eventManager, "emitToClient");

    // Usamos o utilitário helper recém-criado para simplificar e reaproveitar os mocks de timeout
    setupMockTimeoutResolution(eventManager, state);

    // 2. Executando a ação: P1 joga a carta de bloqueio (cujo ID é 100)
    await playCardEvent.action(
      state,
      eventManager,
      { cardId: 100, playerId: 1 },
      p1,
    );

    // 3. Asserções do Estado do Jogo:
    expect(p1.hand.length).toBe(0);
    expect(deckState.topDiscard).toBe(blockCard);

    // O jogador atual do turno agora deve ser P3 (pois P2 foi bloqueado e pulado)
    expect(state.room.turn.currentPlayer.value).toBe(p3);

    // 4. Asserções das Emissões de Eventos (Rede):
    const playedCardEmitted = emitSpy.mock.calls.some((args: any) => {
      const event = args[0] as VoidServerEvent<any>;
      return (
        event.name === "BROADCAST:client:PLAY_CARD" &&
        event.data.card.name === "BLUE_BLOCK"
      );
    });
    expect(playedCardEmitted).toBe(true);

    const permissionsEmitted = emitSpy.mock.calls.some((args: any) => {
      const event = args[0] as PermissionsEvent;
      return event.name === "PERMISSIONS" && event.data.playerId === 3;
    });
    expect(permissionsEmitted).toBe(true);
  });

  test("deve gerenciar interações com Jump-In de Block (4 players)", async () => {
    // 1. Configurando o cenário: 4 jogadores (P1, P2, P3, P4)
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const p3 = createMockPlayer(3);
    const p4 = createMockPlayer(4);

    // P1 joga um Block azul (ID: 100)
    const blockCard1 = createBlock(100, COLOR.BLUE, "BLUE_BLOCK");
    p1.hand = [blockCard1];

    // P4 tem outra exatamente igual na mão para poder dar Jump-In! (ID: 400)
    const blockCard2 = createBlock(400, COLOR.BLUE, "BLUE_BLOCK");
    p4.hand = [blockCard2];

    // P2 e P3 têm cartas comuns
    p2.hand = [createMockCard(200, Type.NUMBERED, COLOR.RED, 5)];
    p3.hand = [createMockCard(300, Type.NUMBERED, COLOR.RED, 6)];

    const turnState = createMockTurnState([p1, p2, p3, p4]);
    // Precisamos registrar as cartas de P1 e P4 no wholeDeck do deckState, pois o Jump-in usa getCardById!
    const deckState = createMockDeckState(
      [],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 2),
    );
    deckState.wholeDeck = [];
    deckState.wholeDeck[100] = blockCard1;
    deckState.wholeDeck[400] = blockCard2;

    const state = createMockState([p1, p2, p3, p4], deckState, turnState);
    const eventManager = new DefautlEventManager(state);

    // Registra os handlers de eventos do cliente necessários para que o EventManager saiba repassar a ação ao receber emit
    // Normalmente as instâncias do servidor fazem isso bindando eventos. Vamos simular esse bind aqui.
    eventManager.on(jumpInEvent.name, (data: any, player: any) => {
      jumpInEvent.action(state, eventManager, data, player);
    });

    const emitSpy = vi.spyOn(eventManager, "emitToClient");

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

    // 2. Executando a ação: P1 joga a carta de bloqueio (cujo ID é 100)
    // O await espera toda a cadeia de Promises incluindo o Jump-In e o tryChange do Jump-In se concluírem!
    await playCardEvent.action(
      state,
      eventManager,
      { cardId: 100, playerId: 1 },
      p1,
    );

    await whenDone;

    // 3. Asserções do Estado do Jogo:
    // A primeira e a segunda carta Block devem ter sido descartadas
    expect(p1.hand.length).toBe(0);
    expect(p4.hand.length).toBe(0);
    expect(deckState.topDiscard).toBe(blockCard2); // A última descartada no topo deve ser a do P4 que deu jumpin

    // O jogador atual do turno final agora deve ser P2!
    // P4 deu jump-in, definindo o turno em P4. O efeito da sua block pulou P1 (o próximo de P4). Logo a vez é do P2!
    expect(state.room.turn.currentPlayer.value).toBe(p2);

    // 4. Asserções das Emissões de Eventos (Rede):
    // Deve ter emitido o evento de confirmação de descarte de Block por P1
    const playedCard1Emitted = emitSpy.mock.calls.some((args: any) => {
      const event = args[0] as VoidServerEvent<any>;
      return (
        event.name === "BROADCAST:client:PLAY_CARD" &&
        event.data.card.name === "BLUE_BLOCK"
      );
    });
    expect(playedCard1Emitted).toBe(true);

    // Deve ter emitido o PermissionsEvent sinalizando que o Jump-In estava disponível na rede!
    const jumpInPermissionsEmitted = emitSpy.mock.calls.some((args: any) => {
      const event = args[0] as PermissionsEvent;
      return (
        event.name === "PERMISSIONS" &&
        event.data.allowedEvents[4].includes("client:JUMP_IN")
      );
    });
    expect(jumpInPermissionsEmitted).toBe(true);

    // Deve ter emitido o evento de broadcast do Jump-in concluído pelo P4
    const jumpInBroadcastEmitted = emitSpy.mock.calls.some((args: any) => {
      const event = args[0] as VoidServerEvent<any>;
      return (
        event.name === "BROADCAST:client:JUMP_IN" &&
        event.sendedBy?.id === 4 &&
        event.data.target.id === 100 &&
        event.data.cardJumpedIn.id === 400
      );
    });
    expect(jumpInBroadcastEmitted).toBe(true);

    // Deve ter emitido o PermissionsEvent final configurando o turno para o jogador 2 (P2)
    const permissionsEmitted = emitSpy.mock.calls.some((args: any) => {
      const event = args[0] as PermissionsEvent;
      return event.name === "PERMISSIONS" && event.data.playerId === 2;
    });
    expect(permissionsEmitted).toBe(true);
  });
});
