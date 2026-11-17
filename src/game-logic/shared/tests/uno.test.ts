import { describe, expect, test, vi } from "vitest";
import { playCardEvent } from "../events/client/play-card.event.ts";
import { unoEvent } from "../events/client/uno.event.ts";
import { DefautlEventManager } from "../events/event.manager.ts";
import { DefaultEventGuard } from "../events/event.guard.ts";
import { COLOR, Configs, Type } from "../cards/default.card.ts";
import { ServerEventPayloads } from "../events/server/server-payloads.ts";
import { CardDrawEvent } from "../events/server/card-draw.event.ts";
import { VoidServerEvent } from "../events/server/void.events.ts";
import { ClientEventPayloads } from "../events/client/client-payloads.ts";
import {
  createMockCard,
  createMockDeckState,
  createMockPlayer,
  createMockState,
  createMockTurnState,
} from "./mocks.ts";

describe("Mecânica de UNO", () => {
  const configs: Configs = {
    SEVEN_HAS_EFFECT: true,
    ZERO_HAS_EFFECT: true,
    DRAW_2_OVER_DRAW_4: true,
    DRAW_UNTIL_HAVE: true,
    JUMPIN: false,
    DRAW_4_CHALLENGES: true,
    CanWin: true,
  };

  test("Jogador diz UNO (saidUno: true) ao ficar com 1 carta: não abre timer e não sofre penalidade", async () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);

    const cardToPlay = createMockCard(100, Type.NUMBERED, COLOR.BLUE, 5);
    const remainingCard = createMockCard(101, Type.NUMBERED, COLOR.RED, 3);
    p1.hand = [cardToPlay, remainingCard]; // 2 cartas, ficará com 1
    p2.hand = [createMockCard(200, Type.NUMBERED, COLOR.RED, 4)];

    const turnState = createMockTurnState([p1, p2]);
    const deckState = createMockDeckState(
      [createMockCard(500, Type.NUMBERED, COLOR.BLUE, 1)],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 0),
    );

    const state = createMockState([p1, p2], deckState, turnState);
    state.configs = configs;
    const eventManager = new DefautlEventManager(state);

    const waitForEventSpy = vi.spyOn(eventManager, "waitForEvent");
    const emitSpy = vi.spyOn(eventManager, "emitToClient");

    await playCardEvent.action(
      state,
      eventManager,
      { cardId: 100, playerId: 1, saidUno: true },
      p1,
    );

    // O broadcast do PLAY_CARD deve conter saidUno: true
    const playCardBroadcast = emitSpy.mock.calls
      .map((call) => call[0])
      .find((ev) => ev.name === ServerEventPayloads.PLAY_CARD.broadcastName);
    expect(playCardBroadcast).toBeDefined();
    expect(playCardBroadcast.data.saidUno).toBe(true);

    // Não deve ter chamado waitForEvent para client:UNO
    expect(waitForEventSpy).not.toHaveBeenCalledWith(
      expect.arrayContaining([unoEvent.name]),
      expect.any(Number),
      expect.any(Array),
      expect.any(Array),
      expect.any(Function),
      expect.objectContaining({ action: "UNO" }),
    );

    // P1 continua com apenas 1 carta na mão
    expect(p1.hand.length).toBe(1);
    expect(p1.hand[0].id).toBe(101);
  });

  test("Jogador NÃO diz UNO (saidUno: false) ao ficar com 1 carta e oponente denuncia: P1 compra 2 cartas", async () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);

    const cardToPlay = createMockCard(100, Type.NUMBERED, COLOR.BLUE, 5);
    const remainingCard = createMockCard(101, Type.NUMBERED, COLOR.RED, 3);
    p1.hand = [cardToPlay, remainingCard];
    p2.hand = [createMockCard(200, Type.NUMBERED, COLOR.RED, 4)];

    const penaltyCard1 = createMockCard(501, Type.NUMBERED, COLOR.BLUE, 1);
    const penaltyCard2 = createMockCard(502, Type.NUMBERED, COLOR.BLUE, 2);
    const turnState = createMockTurnState([p1, p2]);
    const deckState = createMockDeckState(
      [penaltyCard1, penaltyCard2],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 0),
    );

    const state = createMockState([p1, p2], deckState, turnState);
    state.configs = configs;
    const eventManager = new DefautlEventManager(state);

    const emitSpy = vi.spyOn(eventManager, "emitToClient");

    // Intercepta a emissão de permissões para responder com UNO vindo do P2
    eventManager.on("PERMISSIONS", (e: any) => {
      if (e.data?.allowedEvents?.[2]?.includes(unoEvent.name)) {
        eventManager.emit(unoEvent.name, { playerId: 2 }, p2);
      }
    });

    await playCardEvent.action(
      state,
      eventManager,
      { cardId: 100, playerId: 1, saidUno: false },
      p1,
    );

    // P1 deve ter comprado 2 cartas de penalidade -> 1 original + 2 = 3 cartas
    expect(p1.hand.length).toBe(3);
    expect(p1.hand).toContain(remainingCard);
    expect(p1.hand).toContain(penaltyCard1);
    expect(p1.hand).toContain(penaltyCard2);

    // Verifica que CardDrawEvent foi emitido
    const cardDrawEvents = emitSpy.mock.calls
      .map((call) => call[0])
      .filter((ev) => ev instanceof CardDrawEvent);

    expect(cardDrawEvents.length).toBe(2);

    // Evento para P1 contém as cartas
    const eventForP1 = cardDrawEvents.find((ev) =>
      ev.for.some((p: any) => p.id === p1.id),
    );
    expect(eventForP1).toBeDefined();
    expect(eventForP1.data.quantity).toBe(2);
    expect(eventForP1.data.cards.length).toBe(2);

    // Evento para os outros jogadores não contém detalhes das cartas
    const eventForOthers = cardDrawEvents.find((ev) =>
      ev.for.some((p: any) => p.id === p2.id),
    );
    expect(eventForOthers).toBeDefined();
    expect(eventForOthers.data.quantity).toBe(2);
    expect(eventForOthers.data.cards.length).toBe(0);
  });

  test("Jogador NÃO diz UNO, mas ele mesmo emite client:UNO: não sofre penalidade", async () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);

    const cardToPlay = createMockCard(100, Type.NUMBERED, COLOR.BLUE, 5);
    const remainingCard = createMockCard(101, Type.NUMBERED, COLOR.RED, 3);
    p1.hand = [cardToPlay, remainingCard];
    p2.hand = [createMockCard(200, Type.NUMBERED, COLOR.RED, 4)];

    const turnState = createMockTurnState([p1, p2]);
    const deckState = createMockDeckState(
      [
        createMockCard(501, Type.NUMBERED, COLOR.BLUE, 1),
        createMockCard(502, Type.NUMBERED, COLOR.BLUE, 2),
      ],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 0),
    );

    const state = createMockState([p1, p2], deckState, turnState);
    state.configs = configs;
    const eventManager = new DefautlEventManager(state);

    eventManager.on("PERMISSIONS", (e: any) => {
      if (e.data?.allowedEvents?.[1]?.includes(unoEvent.name)) {
        // P1 mesmo emite o UNO
        eventManager.emit(unoEvent.name, { playerId: 1 }, p1);
      }
    });

    await playCardEvent.action(
      state,
      eventManager,
      { cardId: 100, playerId: 1, saidUno: false },
      p1,
    );

    // P1 continua com 1 carta, não foi penalizado
    expect(p1.hand.length).toBe(1);
    expect(p1.hand[0].id).toBe(101);
  });

  test("Jogador NÃO diz UNO e ninguém emite UNO (timeout): não sofre penalidade", async () => {
    vi.useFakeTimers();

    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);

    const cardToPlay = createMockCard(100, Type.NUMBERED, COLOR.BLUE, 5);
    const remainingCard = createMockCard(101, Type.NUMBERED, COLOR.RED, 3);
    p1.hand = [cardToPlay, remainingCard];
    p2.hand = [createMockCard(200, Type.NUMBERED, COLOR.RED, 4)];

    const turnState = createMockTurnState([p1, p2]);
    const deckState = createMockDeckState(
      [
        createMockCard(501, Type.NUMBERED, COLOR.BLUE, 1),
        createMockCard(502, Type.NUMBERED, COLOR.BLUE, 2),
      ],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 0),
    );

    const state = createMockState([p1, p2], deckState, turnState);
    state.configs = configs;
    const eventManager = new DefautlEventManager(state);

    const playPromise = playCardEvent.action(
      state,
      eventManager,
      { cardId: 100, playerId: 1 }, // saidUno defaults to false
      p1,
    );

    // Avança o timer para disparar o timeout de UNO (2000ms)
    await vi.advanceTimersByTimeAsync(ServerEventPayloads.UNO.timeout);
    await playPromise;

    expect(p1.hand.length).toBe(1);
    expect(p1.hand[0].id).toBe(101);

    vi.useRealTimers();
  });

  test("Jogador joga sua última carta (fica com 0 cartas): não aciona UNO e vence o jogo", async () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);

    const cardToPlay = createMockCard(100, Type.NUMBERED, COLOR.BLUE, 5);
    p1.hand = [cardToPlay]; // Apenas 1 carta, ficará com 0 após jogar
    p2.hand = [createMockCard(200, Type.NUMBERED, COLOR.RED, 4)];

    const turnState = createMockTurnState([p1, p2]);
    const deckState = createMockDeckState(
      [],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 0),
    );

    const state = createMockState([p1, p2], deckState, turnState);
    state.configs = configs;
    const eventManager = new DefautlEventManager(state);

    const waitForEventSpy = vi.spyOn(eventManager, "waitForEvent");
    const emitSpy = vi.spyOn(eventManager, "emitToClient");

    await playCardEvent.action(
      state,
      eventManager,
      { cardId: 100, playerId: 1, saidUno: false },
      p1,
    );

    // Não deve ter chamado waitForEvent para client:UNO
    expect(waitForEventSpy).not.toHaveBeenCalledWith(
      expect.arrayContaining([unoEvent.name]),
      expect.any(Number),
      expect.any(Array),
      expect.any(Array),
      expect.any(Function),
      expect.objectContaining({ action: "UNO" }),
    );

    // Vitória deve ter sido disparada
    expect(state.victoryTriggered).toBe(true);
    const winEvents = emitSpy.mock.calls
      .map((call) => call[0])
      .filter((ev) => ev.name === ServerEventPayloads.WIN.broadcastName);
    expect(winEvents.length).toBe(1);
    expect(winEvents[0].for).toContain(p1);
  });

  test("Jogador joga carta e fica com 2 cartas na mão: não aciona UNO", async () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);

    const cardToPlay = createMockCard(100, Type.NUMBERED, COLOR.BLUE, 5);
    const rem1 = createMockCard(101, Type.NUMBERED, COLOR.RED, 3);
    const rem2 = createMockCard(102, Type.NUMBERED, COLOR.RED, 4);
    p1.hand = [cardToPlay, rem1, rem2]; // 3 cartas, ficará com 2
    p2.hand = [createMockCard(200, Type.NUMBERED, COLOR.RED, 4)];

    const turnState = createMockTurnState([p1, p2]);
    const deckState = createMockDeckState(
      [],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 0),
    );

    const state = createMockState([p1, p2], deckState, turnState);
    state.configs = configs;
    const eventManager = new DefautlEventManager(state);

    const waitForEventSpy = vi.spyOn(eventManager, "waitForEvent");

    await playCardEvent.action(
      state,
      eventManager,
      { cardId: 100, playerId: 1, saidUno: false },
      p1,
    );

    // Não deve ter chamado waitForEvent para client:UNO
    expect(waitForEventSpy).not.toHaveBeenCalledWith(
      expect.arrayContaining([unoEvent.name]),
      expect.any(Number),
      expect.any(Array),
      expect.any(Array),
      expect.any(Function),
      expect.objectContaining({ action: "UNO" }),
    );

    expect(p1.hand.length).toBe(2);
  });

  test("Integração EventGuard: durante a janela de UNO, outro jogador denuncia via EventGuard", async () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);

    const cardToPlay = createMockCard(100, Type.NUMBERED, COLOR.BLUE, 5);
    const remainingCard = createMockCard(101, Type.NUMBERED, COLOR.RED, 3);
    p1.hand = [cardToPlay, remainingCard];
    p2.hand = [createMockCard(200, Type.NUMBERED, COLOR.RED, 4)];

    const penaltyCard1 = createMockCard(501, Type.NUMBERED, COLOR.BLUE, 1);
    const penaltyCard2 = createMockCard(502, Type.NUMBERED, COLOR.BLUE, 2);
    const turnState = createMockTurnState([p1, p2]);
    const deckState = createMockDeckState(
      [penaltyCard1, penaltyCard2],
      createMockCard(999, Type.NUMBERED, COLOR.BLUE, 0),
    );

    const state = createMockState([p1, p2], deckState, turnState);
    state.configs = configs;
    const guard = new DefaultEventGuard(state);
    const eventManager = guard.eventManager;

    const emitSpy = vi.spyOn(eventManager, "emitToClient");

    eventManager.on("PERMISSIONS", (e: any) => {
      if (e.data?.allowedEvents?.[2]?.includes(unoEvent.name)) {
        // P2 envia UNO através do guard
        guard.guard(p2, unoEvent.name, {});
      }
    });

    await playCardEvent.action(
      state,
      eventManager,
      { cardId: 100, playerId: 1 },
      p1,
    );

    expect(p1.hand.length).toBe(3);

    // BROADCAST:client:UNO foi emitido
    const broadcastEvents = emitSpy.mock.calls
      .map((call) => call[0])
      .filter((ev) => ev.name === ServerEventPayloads.UNO.broadcastName);

    expect(broadcastEvents.length).toBe(1);
    expect(broadcastEvents[0].data.playerId).toBe(2);
  });
});
