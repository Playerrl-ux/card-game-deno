import { describe, expect, test } from "vitest";
import { checkPlayCard } from "../utils/card.utils.ts";
import { getEventArray } from "../utils/events.util.ts";
import {
  createMockCard,
  createMockPlayer,
  createMockDeckState,
  createMockTurnState,
  createMockState,
} from "./mocks.ts";
import { COLOR, Type } from "../cards/default.card.ts";

describe("Utility Functions", () => {
  describe("card.utils - checkPlayCard", () => {
    test("deve retornar true se pelo menos uma carta da mão puder ser colocada sobre o descarte", () => {
      const topDiscard = createMockCard(1, Type.NUMBERED, COLOR.BLUE, 5);
      const hand = [
        createMockCard(2, Type.NUMBERED, COLOR.RED, 3), // incompatível
        createMockCard(3, Type.NUMBERED, COLOR.BLUE, 9), // compatível por cor
      ];
      const player = createMockPlayer(1, hand);
      const player2 = createMockPlayer(2);
      const deckState = createMockDeckState([], topDiscard);
      const turnState = createMockTurnState([player, player2]);
      const state = createMockState([player, player2], deckState, turnState);

      expect(checkPlayCard(topDiscard, hand, state)).toBe(true);
    });

    test("deve retornar false se nenhuma carta da mão puder ser colocada sobre o descarte", () => {
      const topDiscard = createMockCard(1, Type.NUMBERED, COLOR.BLUE, 5);
      const hand = [
        createMockCard(2, Type.NUMBERED, COLOR.RED, 3), // incompatível
        createMockCard(3, Type.NUMBERED, COLOR.GREEN, 9), // incompatível
      ];
      const player = createMockPlayer(1, hand);
      const player2 = createMockPlayer(2);
      const deckState = createMockDeckState([], topDiscard);
      const turnState = createMockTurnState([player, player2]);
      const state = createMockState([player, player2], deckState, turnState);

      expect(checkPlayCard(topDiscard, hand, state)).toBe(false);
    });
  });

  describe("events.util - getEventArray", () => {
    test("deve retornar uma matriz 2D com a lista de eventos atribuída ao ID do jogador", () => {
      const player = createMockPlayer(2); // ID = 2
      const events = ["EVENT_A", "EVENT_B"];

      const result = getEventArray(player, events);

      expect(result.length).toBe(4);
      expect(result[0]).toEqual([]);
      expect(result[1]).toEqual([]);
      expect(result[2]).toBe(events);
      expect(result[3]).toEqual([]);
    });
  });
});
