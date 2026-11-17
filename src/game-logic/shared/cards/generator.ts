import { CardGenerator } from "../../base/card.generator.ts";
import { CardQuantities } from "../../base/card.ts";
import { DefaultDeckManager } from "../state/functions/deck.functions.ts";
import {
  baseCanBePutOver,
  Card,
  COLOR,
  Configs,
  Type,
} from "./default.card.ts";
import { createBlock } from "./special-models/block.model.ts";
import { createDraw2 } from "./special-models/draw-2.model.ts";
import {
  draw4AfterEffect,
  draw4BeforeEffect,
  draw4CanBePutOver,
} from "./special-models/draw-4.model.ts";
import { createReverse } from "./special-models/reverse.model.ts";
import { create7 } from "./special-models/seven.model.ts";
import { createWild } from "./special-models/wild-card.model.ts";
import { create0 } from "./special-models/zero.model.ts";

export const DefaultGenerator: CardGenerator<Configs, Card> = {
  generateBaseCards(configs: Configs): [Card[], number] {
    const baseCards: Card[] = [];

    const addNormalCard = (name: string, color: COLOR, value: number) => {
      const id = baseCards.length; // Garante o id igual ao índice atual do array
      baseCards.push({
        id,
        name,
        value,
        color,
        effectiveColor: color,
        type: Type.NUMBERED,
        effectBefore: () => undefined,
        effectAfter: () => undefined,
        canBePutOver: baseCanBePutOver,
      });
    };

    // Cartas Coringas (WILD)
    baseCards.push(createWild(baseCards.length, "WILD_CARD"));

    // WILD_DRAW_FOUR (criado manualmente pois não há um createDraw4 exportado no model)
    baseCards.push({
      id: baseCards.length,
      name: "WILD_DRAW_FOUR",
      value: undefined,
      color: COLOR.WILD,
      effectiveColor: undefined,
      type: Type.DRAW_4,
      effectBefore: draw4BeforeEffect,
      effectAfter: draw4AfterEffect,
      canBePutOver: draw4CanBePutOver,
    });

    // Cartas Numéricas e Especiais por cor
    Object.values(COLOR).forEach((color) => {
      if (color === COLOR.WILD) return; // Iterar apenas sobre as cores normais

      // Números de 0 a 9
      Array.from({ length: 10 }).forEach((_, i) => {
        if (i === 0) {
          baseCards.push(
            create0(configs, baseCards.length, color, `${color}_0`),
          );
        } else if (i === 7) {
          baseCards.push(
            create7(configs, baseCards.length, color, `${color}_7`),
          );
        } else {
          addNormalCard(`${color}_${i}`, color, i);
        }
      });

      // Efeitos: Pular, Inverter e +2
      baseCards.push(createBlock(baseCards.length, color, `${color}_SKIP`));
      baseCards.push(
        createReverse(baseCards.length, color, `${color}_REVERSE`),
      );
      baseCards.push(
        createDraw2(configs, baseCards.length, color, `${color}_DRAW_TWO`),
      );
    });

    // Retorna as cartas criadas e o menor id livre (tamanho atual do array)
    return [baseCards, baseCards.length];
  },

  generateAndShuffle(
    quantities: CardQuantities,
    baseCards: Card[],
    firstId: number,
    numberOfDecks = 1,
  ) {
    return DefaultDeckManager.shuffle(
      this.generateFullDecks(quantities, baseCards, firstId, numberOfDecks),
    );
  },

  //O primeiro id que vai ser atribuido para uma carta sera firstId
  //certificar de fazer firstId ser diferente do usado para gerar as cartas base
  generateFullDecks(
    quantities: CardQuantities,
    baseCards: Card[],
    firstId: number,
    numberOfDecks = 1,
  ): Card[] {
    if (numberOfDecks < 1) {
      numberOfDecks = 1;
    }

    const deck: Card[] = [];

    for (let i = 1; i <= numberOfDecks; i++) {
      for (const [name, quantity] of Object.entries(quantities)) {
        const baseCard = baseCards.find((c) => c.name === name);
        if (!baseCard) {
          console.warn(`Card not found in baseCards: ${name}`);
          continue;
        }

        for (let q = 0; q < quantity; q++) {
          const newCard = { ...baseCard };
          newCard.id = firstId++;
          deck.push(newCard);
        }
      }
    }

    return deck;
  },
};
