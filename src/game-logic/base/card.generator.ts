import { CardQuantities } from "./card.ts";

export interface CardGenerator<CO, C> {
  generateBaseCards(configs: CO): [C[], number];

  generateAndShuffle(
    quantities: CardQuantities,
    baseCards: C[],
    firstId: number,
    numberOfDecks: number,
  ): C[];

  //O primeiro id que vai ser atribuido para uma carta sera firstId + 1
  //certificar de fazer firstId ser diferente do usado para gerar as cartas base
  generateFullDecks(
    quantities: CardQuantities,
    baseCards: C[],
    firstId: number,
    numberOfDecks: number,
  ): C[];
}
