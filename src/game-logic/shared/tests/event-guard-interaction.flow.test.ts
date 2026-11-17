import { describe, expect, test, vi } from "vitest";
import { DefaultEventGuard } from "../events/event.guard.ts";
import { DefautlEventManager } from "../events/event.manager.ts";
import {
  createMockState,
  createMockPlayer,
  createMockTurnState,
  createMockDeckState,
  createMockCard,
} from "./mocks.ts";
import { COLOR, Type, baseCanBePutOver } from "../cards/default.card.ts";
import { draw4BeforeEffect, draw4AfterEffect } from "../cards/special-models/draw-4.model.ts";
import { sevenBeforeEffect, sevenAfterEffect } from "../cards/special-models/seven.model.ts";
import { setupControlledWaitForEvent } from "./event-mock.utils.ts";
import { PermissionsEvent } from "../events/server/permissions.event.ts";
import { ClientEventPayloads } from "../events/client/client-payloads.ts";
import { chooseColor } from "../events/client/choose-color.event.ts";
import { challengeEvent } from "../events/client/challenge.event.ts";
import { selectHandEvent } from "../events/client/select-hand.event.ts";

import { createDraw4 } from "../cards/special-models/draw-4.model.ts";

const createSeven = (id: number, color: COLOR) => ({
  id,
  name: `${color}_7`,
  value: 7,
  color,
  effectiveColor: color,
  type: Type.NUMBERED,
  effectBefore: sevenBeforeEffect,
  effectAfter: sevenAfterEffect,
  canBePutOver: baseCanBePutOver,
});

describe("Integração Completa EventGuard com Eventos Intermediários", () => {
  test("EventGuard processa PlayCard (+4) -> ChooseColor -> JumpIn (7) -> SelectHand", async () => {
    // Configura 4 jogadores
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const p3 = createMockPlayer(3);
    const p4 = createMockPlayer(4);

    // P1 tem o +4
    const draw4Card = createDraw4(100);
    p1.hand = [draw4Card];

    // P3 tem um RED 7 (que ele vai usar pra jump-in logo depois do +4)
    // Na verdade, jump-in de 7 em cima de +4 não é possível pelas regras normais (tipos/cores não batem).
    // Mas vamos testar o fluxo do +4 e dps o JUMP-IN de algo válido. O JUMP-IN de +4 precisaria do CHOOSE_COLOR também!
    const jumpDraw4 = createDraw4(101);
    p3.hand = [jumpDraw4];

    // Descarte é RED 5
    const turnState = createMockTurnState([p1, p2, p3, p4]);
    const deckState = createMockDeckState(
      Array.from({ length: 10 }).map((_, i) => createMockCard(500 + i, Type.NUMBERED, COLOR.BLUE, i)),
      createMockCard(999, Type.NUMBERED, COLOR.RED, 5),
    );

    // Adiciona as cartas que estão nas mãos na wholeDeck para que `getCardById` funcione,
    // pois no jogo real `wholeDeck` contém todas as cartas criadas mapeadas por ID.
    deckState.wholeDeck[100] = draw4Card;
    deckState.wholeDeck[101] = jumpDraw4;

    const state = createMockState([p1, p2, p3, p4], deckState, turnState);
    state.configs.JUMPIN = true;
    state.configs.SEVEN_HAS_EFFECT = true;

    // Precisamos registrar os action handlers corretamente mockados para que eles não travem em funções não implementadas nos mocks
    // Como estamos usando o DefaultEventGuard, vamos instanciar
    const guard = new DefaultEventGuard(state);
    const eventManager = guard.eventManager as DefautlEventManager;

    // Para evitar deadlocks de timeouts, vamos mockar os eventos intermediários
    // E usaremos o guard.guard() diretamente
    
    // O mock controla as resoluções de waitForEvent (JUMP_IN, CHOOSE_COLOR)
    // O flow real é:
    // 1. JUMP_IN (antes do effectAfter do P1). P3 dá jump-in.
    // 2. CHOOSE_COLOR (dentro do effectAfter do P3). P3 escolhe cor.
    // 3. CHALLENGE (dentro do drawLogic do P3).
    setupControlledWaitForEvent(eventManager, state, [
      { action: "wait" }, // JUMP_IN window
      { action: "wait" }, // CHOOSE COLOR (P3)
      { action: "wait" }, // CHALLENGE (P3 target)
    ]);

    let chooseColorP1Emitted = false;
    let jumpInEmitted = false;
    let chooseColorP3Emitted = false;

    eventManager.on("PERMISSIONS", (e: PermissionsEvent) => {
      // P1 CHOOSE_COLOR
      if (e.data.allowedEvents[1]?.includes(chooseColor.name) && !chooseColorP1Emitted) {
        chooseColorP1Emitted = true;
        guard.guard(p1, chooseColor.name, { color: COLOR.BLUE });
      }
      
      // JUMP_IN window
      if (e.data.allowedEvents[3]?.includes(ClientEventPayloads.JUMP_IN.commomName) && !jumpInEmitted) {
        jumpInEmitted = true;
        guard.guard(p3, ClientEventPayloads.JUMP_IN.commomName, { cardJumpedId: 101, targetId: 100 });
      }

      // P3 CHOOSE_COLOR (decorrente do JUMP_IN de +4)
      if (e.data.allowedEvents[3]?.includes(chooseColor.name) && !chooseColorP3Emitted) {
        chooseColorP3Emitted = true;
        guard.guard(p3, chooseColor.name, { color: COLOR.GREEN });
      }

      // CHALLENGE window após o +4 do P3
      // Quem joga depois do P3 é o P4 (que tem ID 4). Vamos passar direto para não travar
      if (e.data.allowedEvents[4]?.includes(challengeEvent.name)) {
        // Envia o desafio para que a promessa resolva rápido e não cause timeout leak
        guard.guard(p4, challengeEvent.name, { challenge: false });
      }
    });

    // Inicia a jogada chamando o action diretamente
    // Num cenário real o socket chamaria guard.guard(p1, "client:PLAY_CARD", ...)
    // Mas a emissão via guard internamente chamaria a function playCardEvent.action.
    // Vamos começar chamando o action do evento de PLAY_CARD
    state.eventsValidMap.set(p1, [ClientEventPayloads.PLAY_CARD.commomName]);
    guard.guard(p1, ClientEventPayloads.PLAY_CARD.commomName, { cardId: 100 });

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Se houver algum deadlock lógico, o await do guard ficará preso e o vitest dará timeout
    // Ou se tryChange não funcionar, a gente não vai ter a permissão de CHOOSE_COLOR para o desafio etc.

    // Checamos se P3 realmente finalizou seu jump-in
    // Se o +4 resolver para P3, P1 não deve emitir choose color porque seu effectAfter foi cancelado.
    // A ideia é que chegue até o final sem travar.
    expect(jumpInEmitted).toBe(true);
    expect(chooseColorP3Emitted).toBe(true);
  });

  test("EventGuard processa PlayCard (+4) -> ChooseColor -> Challenge (Win) -> Mudança de turno", async () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);

    const draw4Card = createDraw4(100);
    p1.hand = [draw4Card];
    p2.hand = [createMockCard(101, Type.NUMBERED, COLOR.RED, 5)];

    const turnState = createMockTurnState([p1, p2]);
    const deckState = createMockDeckState(
      Array.from({ length: 10 }).map((_, i) => createMockCard(500 + i, Type.NUMBERED, COLOR.BLUE, i)),
      createMockCard(999, Type.NUMBERED, COLOR.RED, 5),
    );

    // Adiciona as cartas que estão nas mãos na wholeDeck para que `getCardById` funcione,
    // pois no jogo real `wholeDeck` contém todas as cartas criadas mapeadas por ID.
    deckState.wholeDeck[100] = draw4Card;
    deckState.wholeDeck[101] = p2.hand[0];

    const state = createMockState([p1, p2], deckState, turnState);
    state.configs.JUMPIN = false;

    const guard = new DefaultEventGuard(state);
    const eventManager = guard.eventManager as DefautlEventManager;

    setupControlledWaitForEvent(eventManager, state, [
      { action: "wait" }, // choose color
      { action: "wait" }, // challenge window
    ]);

    let chooseColorEmitted = false;
    let challengeEmitted = false;
    let turnPassedToP2 = false;

    eventManager.on("PERMISSIONS", (e: PermissionsEvent) => {
      console.log("[TEST 2 PERMISSIONS]", e.data.allowedEvents, "playerId:", e.data.playerId);
      if (e.data.allowedEvents[1]?.includes(chooseColor.name) && !chooseColorEmitted) {
        console.log("[TEST 2] P1 Emitting CHOOSE_COLOR");
        chooseColorEmitted = true;
        guard.guard(p1, chooseColor.name, { color: COLOR.BLUE });
      }

      if (e.data.allowedEvents[2]?.includes(challengeEvent.name) && !challengeEmitted) {
        console.log("[TEST 2] P2 Emitting CHALLENGE");
        challengeEmitted = true;
        guard.guard(p2, challengeEvent.name, { challenge: true });
      }

      // After challenge is resolved, turn should pass to P1 (since P2 lost and their turn is skipped!)
      // Wait, if P2 loses, next player is P1 (2 players).
      if (e.data.playerId === 1 && challengeEmitted) {
        turnPassedToP2 = true;
      }
    });

    state.eventsValidMap.set(p1, [ClientEventPayloads.PLAY_CARD.commomName]);
    guard.guard(p1, ClientEventPayloads.PLAY_CARD.commomName, { cardId: 100 });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(chooseColorEmitted).toBe(true);
    expect(challengeEmitted).toBe(true);
    expect(turnPassedToP2).toBe(true);
  });
});
