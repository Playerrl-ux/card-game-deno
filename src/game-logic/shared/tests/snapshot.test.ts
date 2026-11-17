import { describe, expect, test } from "vitest";
import { DefaultStateManager } from "../state/functions/state.functions.ts";
import {
  createMockCard,
  createMockDeckState,
  createMockPlayer,
  createMockState,
  createMockTurnState,
} from "./mocks.ts";
import { COLOR, Type } from "../cards/default.card.ts";
import { RoomJoinedEvent } from "../../../network/external.event.ts";
import { PlayerSocketImpl } from "../../../network/player.socket.ts";
import { GameSnapshotEvent } from "../events/server/game-snapshot.event.ts";

describe("Testes da Funcionalidade de Game Snapshot", () => {
  test("Deve gerar o snapshot correto do estado do jogo para um jogador específico", () => {
    const p1 = createMockPlayer(1, [
      createMockCard(101, Type.NUMBERED, COLOR.BLUE, 5),
      createMockCard(102, Type.NUMBERED, COLOR.RED, 3),
    ]);
    const p2 = createMockPlayer(2, [
      createMockCard(201, Type.NUMBERED, COLOR.GREEN, 7),
    ]);

    const turnState = createMockTurnState([p1, p2]);
    const topDiscard = createMockCard(999, Type.NUMBERED, COLOR.YELLOW, 9);
    const deckState = createMockDeckState([], topDiscard);
    const state = createMockState([p1, p2], deckState, turnState);

    state.eventsValidMap.set(p1, ["client:PLAY_CARD"]);

    // Simula o registro de um último evento recebido
    const lastEv = new RoomJoinedEvent(null, [p1], {
      roomName: "test-room",
      playerId: p1.id,
      players: [{ id: p1.id }],
    });
    p1.network.lastEvent = lastEv;
    p1.network.lastClientEventName = "client:PLAY_CARD";

    const snapshot = DefaultStateManager.createSnapshot(state, p1);

    // Valida jogadores e contagem de cartas na mão
    expect(snapshot.players).toEqual([
      { id: 1, handCount: 2, lastClientEventName: "client:PLAY_CARD" },
      { id: 2, handCount: 1, lastClientEventName: null },
    ]);

    // Valida ordem dos jogadores e jogador do turno atual
    expect(snapshot.playerOrder).toEqual([1, 2]);
    expect(snapshot.currentPlayerId).toBe(1);
    expect(snapshot.direction).toBe("RIGHT");

    // Valida cartas na mão do jogador solicitante
    expect(snapshot.handCards).toEqual([
      { id: 101, name: "BLUE_NUMBERED_5", color: COLOR.BLUE, type: Type.NUMBERED, value: 5, effectiveColor: undefined },
      { id: 102, name: "RED_NUMBERED_3", color: COLOR.RED, type: Type.NUMBERED, value: 3, effectiveColor: undefined },
    ]);

    // Valida carta do topo do descarte
    expect(snapshot.topDiscard).toEqual({
      id: 999,
      name: "YELLOW_NUMBERED_9",
      color: COLOR.YELLOW,
      type: Type.NUMBERED,
      value: 9,
      effectiveColor: undefined,
    });

    // Valida último evento (sanitizado sem referências circulares) e eventos permitidos
    expect(snapshot.lastEvent).toEqual({
      name: lastEv.name,
      data: lastEv.data,
      sendedBy: -1,
    });
    expect(() => JSON.stringify(snapshot)).not.toThrow();
    expect(snapshot.lastClientEventName).toBe("client:PLAY_CARD");
    expect(snapshot.allowedEvents).toEqual(["client:PLAY_CARD"]);
    expect(snapshot.configs).toEqual(state.configs);
  });

  test("Deve atualizar lastEvent no PlayerSocketImpl ao enviar mensagem para o jogador", () => {
    const p1 = createMockPlayer(1);
    let capturedLastEvent: any = null;

    p1.network.sendToPlayer = function (event: any) {
      this.lastEvent = event;
    };

    const dummyEvent = new RoomJoinedEvent(null, [p1], {
      roomName: "room-1",
      playerId: p1.id,
      players: [{ id: p1.id }],
    });
    p1.network.sendToPlayer(dummyEvent);

    expect(p1.network.lastEvent).toBe(dummyEvent);
  });

  test("PlayerSocketImpl.sendToPlayer deve sanitizar lastEvent e serializar GameSnapshotEvent sem referência circular", () => {
    const sentMessages: string[] = [];
    const mockWs = {
      send: (msg: string) => sentMessages.push(msg),
    } as unknown as WebSocket;

    const socketImpl = new PlayerSocketImpl(mockWs, false, "sala01");

    const player = {
      id: 1,
      hand: [],
      network: socketImpl,
    };
    const player2 = createMockPlayer(2);

    const dummyEvent = new RoomJoinedEvent(null, [player], {
      roomName: "sala01",
      playerId: 1,
      players: [{ id: 1 }],
    });

    // Envia evento inicial que anteriormente deixava referência circular
    socketImpl.sendToPlayer(dummyEvent);
    expect(socketImpl.lastEvent).toEqual({
      name: "ROOM_JOINED",
      data: { roomName: "sala01", playerId: 1, players: [{ id: 1 }] },
      sendedBy: -1,
    });

    // Gera snapshot e envia GameSnapshotEvent
    const state = createMockState([player, player2], createMockDeckState([]), createMockTurnState([player, player2]));
    const snapshot = DefaultStateManager.createSnapshot(state, player);

    const snapshotEvent = new GameSnapshotEvent(null, [player], snapshot);
    expect(() => socketImpl.sendToPlayer(snapshotEvent)).not.toThrow();

    expect(sentMessages.length).toBe(2);
    const parsedSnapshotMessage = JSON.parse(sentMessages[1]);
    expect(parsedSnapshotMessage.name).toBe("GAME_SNAPSHOT");
    expect(parsedSnapshotMessage.data.lastEvent).toEqual({
      name: "ROOM_JOINED",
      data: { roomName: "sala01", playerId: 1, players: [{ id: 1 }] },
      sendedBy: -1,
    });
    expect(parsedSnapshotMessage.data.configs).toEqual(state.configs);
  });
});
