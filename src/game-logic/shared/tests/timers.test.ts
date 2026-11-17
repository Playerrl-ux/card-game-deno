import { describe, expect, test } from "vitest";
import { DefautlEventManager } from "../events/event.manager.ts";
import { GameTimer } from "../../base/state.ts";
import {
  createMockCard,
  createMockDeckState,
  createMockPlayer,
  createMockState,
  createMockTurnState,
} from "./mocks.ts";
import { COLOR, Type } from "../cards/default.card.ts";

describe("Testes de Gerenciamento de Timers no Estado e EventManager (activeTimer)", () => {
  test("Deve registrar GameTimer em state.activeTimer ao iniciar waitForEvent", async () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const turnState = createMockTurnState([p1, p2]);
    const deckState = createMockDeckState([], createMockCard(1, Type.NUMBERED, COLOR.BLUE, 5));
    const state = createMockState([p1, p2], deckState, turnState);

    const eventManager = new DefautlEventManager(state);

    const waitPromise = eventManager.waitForEvent(["client:PLAY_CARD"], 1000, [p1], []);

    expect(state.activeTimer).toBeDefined();
    const activeTimer = state.activeTimer!;
    expect(activeTimer.duration).toBe(1000);
    expect(typeof activeTimer.createdAt).toBe("number");
    expect(activeTimer.timer).toBeDefined();
    expect(activeTimer.isActive).toBe(true);
    expect(activeTimer.eventsName).toEqual(["client:PLAY_CARD"]);
    expect(activeTimer.allowedPlayers).toEqual([{ id: p1.id }]);
    expect(activeTimer.timeoutEventName).toBe("TIMEOUT");

    // Resolvendo a ação do jogador antes do timeout
    eventManager.emit("client:PLAY_CARD", {}, p1);
    await waitPromise;
  });

  test("pauseTimer deve pausar o timer e decrementar duration restante", async () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const turnState = createMockTurnState([p1, p2]);
    const deckState = createMockDeckState([], createMockCard(1, Type.NUMBERED, COLOR.BLUE, 5));
    const state = createMockState([p1, p2], deckState, turnState);

    const eventManager = new DefautlEventManager(state);
    const waitPromise = eventManager.waitForEvent(["client:PLAY_CARD"], 1000, [p1], []);

    // Pausar o timer do p1
    eventManager.pauseTimer(p1);

    expect(state.activeTimer?.isActive).toBe(false);
    expect(state.activeTimer?.duration).toBeLessThanOrEqual(1000);

    // Se chamar pauseTimer para player não autorizado, não deve quebrar
    eventManager.pauseTimer(p2);

    // Resolvendo evento para limpar promise
    eventManager.emit("client:PLAY_CARD", {}, p1);
    await waitPromise;
  });

  test("sendErrorAndReactivateTimer não deve alterar timer se ele ainda estiver ativo", async () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const turnState = createMockTurnState([p1, p2]);
    const deckState = createMockDeckState([], createMockCard(1, Type.NUMBERED, COLOR.BLUE, 5));
    const state = createMockState([p1, p2], deckState, turnState);

    const eventManager = new DefautlEventManager(state);
    const waitPromise = eventManager.waitForEvent(["client:PLAY_CARD"], 1000, [p1], []);

    const durationBefore = state.activeTimer?.duration;
    const createdAtBefore = state.activeTimer?.createdAt;

    // Erro durante validação (timer ainda ativo)
    eventManager.sendErrorAndReactivateTimer(p1, "Invalid data");

    // O timer deve permanecer ativo e inalterado
    expect(state.activeTimer?.isActive).toBe(true);
    expect(state.activeTimer?.duration).toBe(durationBefore);
    expect(state.activeTimer?.createdAt).toBe(createdAtBefore);

    eventManager.emit("client:PLAY_CARD", {}, p1);
    await waitPromise;
  });

  test("sendErrorAndReactivateTimer deve reativar timer e restaurar permissoes se estava pausado", async () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const turnState = createMockTurnState([p1, p2]);
    const deckState = createMockDeckState([], createMockCard(1, Type.NUMBERED, COLOR.BLUE, 5));
    const state = createMockState([p1, p2], deckState, turnState);

    const eventManager = new DefautlEventManager(state);
    const waitPromise = eventManager.waitForEvent(["client:PLAY_CARD"], 1000, [p1], []);

    // Simula pausa após validação
    eventManager.pauseTimer(p1);
    state.eventsValidMap.resetAll(); // permissões limpas antes do emit

    expect(state.activeTimer?.isActive).toBe(false);
    expect(state.eventsValidMap.get(p1)).toEqual([]);

    // Erro na lógica do jogo
    eventManager.sendErrorAndReactivateTimer(p1, "Action error");

    // Deve reativar o timer e restaurar as permissões
    expect(state.activeTimer?.isActive).toBe(true);
    expect(state.eventsValidMap.get(p1)).toEqual(["client:PLAY_CARD"]);

    eventManager.emit("client:PLAY_CARD", {}, p1);
    await waitPromise;
  });

  test("Deve emitir TimeoutToPlayer ao expirar o timer sem ação do jogador", async () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const turnState = createMockTurnState([p1, p2]);
    const deckState = createMockDeckState([], createMockCard(1, Type.NUMBERED, COLOR.BLUE, 5));
    const state = createMockState([p1, p2], deckState, turnState);

    const sentEventsP1: any[] = [];
    p1.network.sendToPlayer = (ev: any) => sentEventsP1.push(ev);

    const eventManager = new DefautlEventManager(state);

    const waitPromise = eventManager.waitForEvent(["client:PLAY_CARD"], 15, [p1], []);

    await waitPromise;

    // Deve ter enviado TimeoutToPlayer
    const timeoutEv = sentEventsP1.find((e) => e.name === "TIMEOUT-TO-PLAYER");
    expect(timeoutEv).toBeDefined();
    expect(timeoutEv.data.playerId).toBe(p1.id);
  });

  test("Timer reativado por sendErrorAndReactivateTimer deve emitir TimeoutToPlayer e disparar timeoutActionCallback ao expirar", async () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const turnState = createMockTurnState([p1, p2]);
    const deckState = createMockDeckState([], createMockCard(1, Type.NUMBERED, COLOR.BLUE, 5));
    const state = createMockState([p1, p2], deckState, turnState);

    const sentEventsP1: any[] = [];
    p1.network.sendToPlayer = (ev: any) => sentEventsP1.push(ev);

    let actionExecuted = false;
    const timeoutAction = () => {
      actionExecuted = true;
    };

    const eventManager = new DefautlEventManager(state);
    const waitPromise = eventManager.waitForEvent(["client:PLAY_CARD"], 20, [p1], [], timeoutAction);

    // Pausar
    eventManager.pauseTimer(p1);
    expect(state.activeTimer?.isActive).toBe(false);

    // Reativar via sendErrorAndReactivateTimer
    eventManager.sendErrorAndReactivateTimer(p1, "Error post validation");
    expect(state.activeTimer?.isActive).toBe(true);

    // Esperar expirar
    await new Promise((resolve) => setTimeout(resolve, 35));

    expect(actionExecuted).toBe(true);
    const timeoutEv = sentEventsP1.find((e) => e.name === "TIMEOUT-TO-PLAYER");
    expect(timeoutEv).toBeDefined();
    expect(timeoutEv.data.playerId).toBe(p1.id);

    // O timer e eventos válidos devem ter sido limpos pelo novo cleanup
    expect(state.eventsValidMap.get(p1)).toEqual([]);
  });
});
