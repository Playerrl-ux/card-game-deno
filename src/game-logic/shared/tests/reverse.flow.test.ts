import { describe, expect, test, vi } from "vitest";
import { playCardEvent } from "../events/client/play-card.event.ts";
import { createReverse } from "../cards/special-models/reverse.model.ts";
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
import { ChangeDirectionEvent } from "../events/server/change-direction.event.ts";
import { DIRECTION } from "../../base/state.ts";
import {
  setupMockTimeoutResolution,
  setupControlledWaitForEvent,
} from "./event-mock.utils.ts";
import { jumpInEvent } from "../events/client/jumpin.event.ts";

describe("Teste de Integração (Fluxo de jogo) - Efeito de Reverse", () => {
  test("deve inverter a direção de turnos e passar a vez para jogador anterior (sendo sentido anti-horário)", async () => {
    // 1. Configurando o cenário: 3 jogadores (P1, P2, P3)
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const p3 = createMockPlayer(3);

    // P1 joga a carta de reverse azul
    const reverseCard = createReverse(100, COLOR.BLUE, "BLUE_REVERSE");
    p1.hand = [reverseCard];

    // P2 e P3 têm cartas numeradas
    p2.hand = [createMockCard(200, Type.NUMBERED, COLOR.RED, 5)];
    p3.hand = [createMockCard(300, Type.NUMBERED, COLOR.RED, 6)];

    const turnState = createMockTurnState([p1, p2, p3]);
    const deckState = createMockDeckState(
      [],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 2),
    );
    const state = createMockState([p1, p2, p3], deckState, turnState);
    const eventManager = new DefautlEventManager(state);

    const emitSpy = vi.spyOn(eventManager, "emitToClient");
    setupMockTimeoutResolution(eventManager, state);

    // 2. Executando a ação: P1 joga a carta de reverse (ID: 100)
    await playCardEvent.action(
      state,
      eventManager,
      { cardId: 100, playerId: 1 },
      p1,
    );

    // 3. Asserções do Estado do Jogo:
    expect(p1.hand.length).toBe(0);
    expect(deckState.topDiscard).toBe(reverseCard);

    // O sentido deve ter mudado para ESQUERDA
    expect(state.room.turn.direction).toBe(DIRECTION.LEFT);

    // O jogador atual do turno agora deve ser P3 (pois mudou de direção e o anterior a P1 é P3)
    expect(state.room.turn.currentPlayer.value).toBe(p3);

    // 4. Asserções das Emissões de Eventos (Rede):
    const playedCardEmitted = emitSpy.mock.calls.some((args: any) => {
      const event = args[0] as VoidServerEvent<any>;
      return (
        event.name === "BROADCAST:client:PLAY_CARD" &&
        event.data.card.name === "BLUE_REVERSE"
      );
    });
    expect(playedCardEmitted).toBe(true);

    const directionEmitted = emitSpy.mock.calls.some((args: any) => {
      const event = args[0] as ChangeDirectionEvent;
      return event.name === "DIRECTION" && event.data.direction === "LEFT";
    });
    expect(directionEmitted).toBe(true);

    const permissionsEmitted = emitSpy.mock.calls.some((args: any) => {
      const event = args[0] as PermissionsEvent;
      return event.name === "PERMISSIONS" && event.data.playerId === 3;
    });
    expect(permissionsEmitted).toBe(true);
  });

  test("deve gerenciar interações com Jump-In de Reverse (4 players)", async () => {
    // 1. Configurando o cenário: 4 jogadores (P1, P2, P3, P4)
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const p3 = createMockPlayer(3);
    const p4 = createMockPlayer(4);

    // P1 joga um Reverse azul (ID: 100)
    const reverseCard1 = createReverse(100, COLOR.BLUE, "BLUE_REVERSE");
    p1.hand = [reverseCard1];

    // P3 dá Jump-In com outra igual (ID: 300)
    const reverseCard2 = createReverse(300, COLOR.BLUE, "BLUE_REVERSE");
    p3.hand = [reverseCard2];

    p2.hand = [createMockCard(200, Type.NUMBERED, COLOR.RED, 5)];
    p4.hand = [createMockCard(400, Type.NUMBERED, COLOR.RED, 6)];

    const turnState = createMockTurnState([p1, p2, p3, p4]);
    const deckState = createMockDeckState(
      [],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 2),
    );
    deckState.wholeDeck = [];
    deckState.wholeDeck[100] = reverseCard1;
    deckState.wholeDeck[300] = reverseCard2;

    const state = createMockState([p1, p2, p3, p4], deckState, turnState);
    const eventManager = new DefautlEventManager(state);

    eventManager.on(jumpInEvent.name, (data: any, player: any) => {
      jumpInEvent.action(state, eventManager, data, player);
    });

    const emitSpy = vi.spyOn(eventManager, "emitToClient");

    const { whenDone } = setupControlledWaitForEvent(eventManager, state, [
      { action: "wait" },
      { action: "wait" },
    ]);

    eventManager.on("PERMISSIONS", (e: PermissionsEvent) => {
      if (e.data.allowedEvents[3]?.includes("client:JUMP_IN")) {
        eventManager.emit(
          jumpInEvent.name,
          { cardJumpedId: 300, targetId: 100, playerId: 3 },
          p3,
        );
      }
    });

    // 2. Executando a ação: P1 joga a carta de reverse
    await playCardEvent.action(
      state,
      eventManager,
      { cardId: 100, playerId: 1 },
      p1,
    );

    await whenDone;

    // 3. Asserções do Estado do Jogo:
    expect(p1.hand.length).toBe(0);
    expect(p3.hand.length).toBe(0);
    expect(deckState.topDiscard).toBe(reverseCard2);

    // A direção inverteu 2 vezes (DIREITA -> ESQUERDA -> DIREITA)
    expect(state.room.turn.direction).toBe(DIRECTION.RIGHT);

    // O jogador atual do turno final agora deve ser P4!
    // P3 deu jump-in, definindo o turno em P3. A direção é DIREITA.
    // A action do jumpin conclui e passa o turno para o próximo à direita de P3, que é P4.
    expect(state.room.turn.currentPlayer.value).toBe(p4);

    // 4. Asserções das Emissões de Eventos (Rede):
    const playedCard1Emitted = emitSpy.mock.calls.some((args: any) => {
      const event = args[0] as VoidServerEvent<any>;
      return (
        event.name === "BROADCAST:client:PLAY_CARD" &&
        event.data.card.name === "BLUE_REVERSE"
      );
    });
    expect(playedCard1Emitted).toBe(true);

    const jumpInBroadcastEmitted = emitSpy.mock.calls.some((args: any) => {
      const event = args[0] as VoidServerEvent<any>;
      return (
        event.name === "BROADCAST:client:JUMP_IN" &&
        event.sendedBy?.id === 3 &&
        event.data.cardJumpedIn.id === 300
      );
    });
    expect(jumpInBroadcastEmitted).toBe(true);

    // Deve ter emitido a troca de direção 2 vezes
    const directionChangeCalls = emitSpy.mock.calls
      .map((args: any) => args[0] as ChangeDirectionEvent)
      .filter((event) => event.name === "DIRECTION");
    expect(directionChangeCalls.length).toBe(2);
    expect(directionChangeCalls[0].data.direction).toBe("LEFT");
    expect(directionChangeCalls[1].data.direction).toBe("RIGHT");

    const permissionsEmitted = emitSpy.mock.calls.some((args: any) => {
      const event = args[0] as PermissionsEvent;
      return event.name === "PERMISSIONS" && event.data.playerId === 4;
    });
    expect(permissionsEmitted).toBe(true);
  });
});
