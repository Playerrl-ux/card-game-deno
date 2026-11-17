import { describe, expect, test } from "vitest";
import { DefaultGenerator } from "../cards/generator.ts";
import { DefaultDeckManager } from "../state/functions/deck.functions.ts";
import { Configs } from "../cards/default.card.ts";
import { CardQuantities } from "../../base/card.ts";

describe("Verificação de IDs de Cartas Geradas", () => {
  const configs: Configs = {
    SEVEN_HAS_EFFECT: true,
    ZERO_HAS_EFFECT: true,
    DRAW_2_OVER_DRAW_4: true,
    DRAW_UNTIL_HAVE: true,
    JUMPIN: true,
    DRAW_4_CHALLENGES: true,
  };

  test("IDs de baseCards devem ser iguais aos seus respectivos índices no array", () => {
    const [baseCards] = DefaultGenerator.generateBaseCards(configs);

    baseCards.forEach((card, index) => {
      expect(card.id).toBe(index);
    });
  });

  test("IDs de wholeDeck devem ser iguais aos seus respectivos índices no array", () => {
    const quantities: CardQuantities = {
      WILD_CARD: 4,
      WILD_DRAW_FOUR: 4,
      BLUE_0: 1,
      BLUE_1: 2,
      BLUE_2: 2,
      BLUE_3: 2,
      BLUE_4: 2,
      BLUE_5: 2,
      BLUE_6: 2,
      BLUE_7: 2,
      BLUE_8: 2,
      BLUE_9: 2,
      BLUE_SKIP: 2,
      BLUE_REVERSE: 2,
      BLUE_DRAW_TWO: 2,
    };

    const deckState = DefaultDeckManager.createDeckState(
      quantities,
      1,
      configs,
    );

    deckState.wholeDeck.forEach((card, index) => {
      expect(card.id).toBe(index);
    });
  });
});
