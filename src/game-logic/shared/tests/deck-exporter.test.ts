import { expect, test } from "vitest";
import { readFileSync, writeFileSync } from "fs";
import { DefaultGenerator } from "../cards/generator.ts";
import { Card, Configs } from "../cards/default.card.ts";
import { CardQuantitiesSchema } from "../../base/card.ts";
import * as path from "path";

const jsonRelativePath = "../cards/cards.quantities.example.json";

test("Gera JSON do deck completo para inspeção", () => {
  const configs: Configs = {
    SEVEN_HAS_EFFECT: true,
    ZERO_HAS_EFFECT: true,
    DRAW_2_OVER_DRAW_4: true,
    DRAW_UNTIL_HAVE: true,
    JUMPIN: true,
    DRAW_4_CHALLENGES: true,
  };

  // Agora generateBaseCards retorna o deck e o último ID usado
  const [baseCards, lastId] = DefaultGenerator.generateBaseCards(configs);
  console.log("lastId", lastId);
  // Lê o arquivo JSON diretamente
  const jsonPath = path.join(__dirname, jsonRelativePath);
  const rawData = readFileSync(jsonPath, "utf8");
  const quantitiesData = JSON.parse(rawData);

  // Valida o objeto carregado do JSON com o schema do Zod
  const validatedQuantities = CardQuantitiesSchema.parse(quantitiesData);

  // Gera o deck físico começando após o último ID dos modelos
  const deck = DefaultGenerator.generateFullDecks(
    validatedQuantities,
    baseCards as Card[],
    lastId as number,
    1,
  );

  // O JSON.stringify ignora automaticamente propriedades que são funções
  const deckJson = JSON.stringify(
    deck,
    (key, value) => {
      if (typeof value === "function") return undefined;
      return value;
    },
    2,
  );

  const outputPath = path.join(__dirname, "../cards/deck.generated.json");
  writeFileSync(outputPath, deckJson);

  console.log(`\n[Export] Deck JSON gerado com sucesso em: ${outputPath}`);
  expect(deck.length).toBe(108);

  // Verifica se o primeiro ID do deck é o esperado (lastId)
  expect(deck[0].id).toBe(lastId as number);
});
