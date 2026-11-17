import { describe, expect, test } from "vitest";
import { DefaultStateManager } from "../state/functions/state.functions.ts";
import { createMockPlayer } from "./mocks.ts";
import { defaultQuantities } from "../../modes/default-mode/default-quantities.ts";
import { COLOR } from "../cards/default.card.ts";
import { DefaultRandomManager } from "../utils/random.manager.ts";

describe("RandomManager & Seed mechanics", () => {
  test("Seed determinism with same seed", () => {
    const p1 = createMockPlayer(1);
    const p2 = createMockPlayer(2);
    const configs = {
      SEVEN_HAS_EFFECT: true,
      ZERO_HAS_EFFECT: true,
      DRAW_2_OVER_DRAW_4: true,
      DRAW_UNTIL_HAVE: true,
      JUMPIN: true,
      DRAW_4_CHALLENGES: true,
    };

    const seed = 987654321;
    const state1 = DefaultStateManager.createState([p1, p2], configs, defaultQuantities, 1, seed);
    const state2 = DefaultStateManager.createState([p1, p2], configs, defaultQuantities, 1, seed);

    // Deck cards order should match exactly
    const deck1Ids = state1.room.deck.deck.map((c) => c.id);
    const deck2Ids = state2.room.deck.deck.map((c) => c.id);
    expect(deck1Ids).toEqual(deck2Ids);

    // Starting player should match exactly
    expect(state1.room.turn.currentPlayer.value.id).toEqual(state2.room.turn.currentPlayer.value.id);
  });

  test("Wild choice timeout uses state.randomManager", () => {
    const state = { seed: 12345, randomManager: DefaultRandomManager };
    const validColors = [COLOR.RED, COLOR.BLUE, COLOR.GREEN, COLOR.YELLOW];
    const chosenColor = state.randomManager.choice(validColors, state);
    expect(chosenColor).toBeDefined();
    expect(validColors).toContain(chosenColor);
  });
});
