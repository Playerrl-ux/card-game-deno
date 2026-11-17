import { vi } from "vitest";
import { DefautlEventManager } from "../events/event.manager.ts";
import { DefaultState } from "../cards/default.card.ts";
import { PermissionsEvent } from "../events/server/permissions.event.ts";
import { timeoutName } from "../events/inner/timeout.event.ts";

/**
 * Utilitário de testes que intercepta o waitForEvent original de um EventManager,
 * permitindo que os testes utilizem a lógica original real, mas reduzindo todos os
 * timeouts reais do jogo (ex.: 3000ms, 20000ms) para 1ms para que o teste seja instantâneo.
 */
export function setupFastWaitForEvent(eventManager: DefautlEventManager) {
  const original = eventManager.waitForEvent;

  return vi
    .spyOn(eventManager, "waitForEvent")
    .mockImplementation(
      (eventsName, timeout, players, allowedCards, timeoutAction, meta) => {
        const isReactiveEvent = eventsName.some(
          (name) => name === "client:JUMP_IN" || name === "client:SELECT_HAND",
        );

        if (isReactiveEvent) {
          const fastTimeout = timeout > 0 ? 20 : 0;
          return original.call(
            eventManager,
            eventsName,
            fastTimeout,
            players,
            allowedCards,
            timeoutAction,
            meta,
          );
        }

        // Evita loops infinitos de timers e limpa o Event Loop de esperas de turnos longos
        eventManager.emitToClient(
          new PermissionsEvent(
            null,
            eventManager.state.room.players,
            {
              allowedEvents: [[], [], [], []],
              playerId: eventManager.state.room.turn.currentPlayer.value.id,
              allowedCards,
            },
            timeout,
          ),
        );
        return Promise.resolve({
          eventReturned: timeoutName,
          data: null,
        });
      },
    );
}

/**
 * Utilitário para forçar uma resolução síncrona/imediata com Timeout simulado (sem disparar callbacks assíncronos)
 * e disparando o PermissionsEvent para o jogador do turno atual.
 */
export function setupMockTimeoutResolution(
  eventManager: DefautlEventManager,
  state: DefaultState,
) {
  return vi
    .spyOn(eventManager, "waitForEvent")
    .mockImplementation((eventsName, timeout, players, allowedCards) => {
      eventManager.emitToClient(
        new PermissionsEvent(
          null,
          state.room.players,
          {
            allowedEvents: [[], [], [], []],
            playerId: state.room.turn.currentPlayer.value.id,
            allowedCards,
          },
          timeout,
        ),
      );
      return Promise.resolve({
        eventReturned: timeoutName,
        data: null,
      });
    });
}

/**
 * Nova utilidade de fluxo controlado "Option 1".
 * Permite projetar um array de opções de comportamento para cada chamada consecutiva
 * de waitForEvent, livrando o teste de race conditions de timer.
 */
export const DEFAULT_TIMEOUT_TEST = 0;
export function setupControlledWaitForEvent(
  eventManager: DefautlEventManager,
  state: DefaultState,
  flow: { action: "timeout" | "wait" }[],
  timeout: number = DEFAULT_TIMEOUT_TEST,
) {
  const original = eventManager.waitForEvent;
  const pendingPromises: Promise<any>[] = [];
  let resolveDone: () => void = () => {};
  const whenDone = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const spy = vi
    .spyOn(eventManager, "waitForEvent")
    .mockImplementation(
      (eventsName, timeout, players, allowedCards, timeoutAction) => {
        const step = flow.shift();
        const isWait = step?.action === "wait";

        console.log(
          `[MOCK waitForEvent] Resolving ${eventsName} with action: ${step?.action}`,
        );

        let promise: Promise<any>;

        if (isWait) {
          promise = original.call(
            eventManager,
            eventsName,
            timeout,
            players,
            allowedCards,
            timeoutAction,
          );
        } else {
          eventManager.emitToClient(
            new PermissionsEvent(
              null,
              state.room.players,
              {
                allowedEvents: [[], [], [], []],
                playerId: state.room.turn.currentPlayer.value.id,
                allowedCards,
              },
              timeout,
            ),
          );

          promise = Promise.resolve({
            eventReturned: timeoutName,
            data: null,
          }).then((res) => {
            if (step?.action === "timeout" && timeoutAction) {
              timeoutAction(state, eventManager);
            }
            return res;
          });
        }

        if (flow.length === 0) {
          Promise.all(pendingPromises).then(() => {
            // Garante que qualquer continuação de microtask decorrente da resolução
            // das promises originais termine de rodar antes de sinalizar a finalização do teste.
            queueMicrotask(() => {
              resolveDone();
            });
          });
        }

        pendingPromises.push(promise);

        return promise;
      },
    );

  return { spy, whenDone };
}
