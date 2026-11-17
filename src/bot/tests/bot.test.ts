/**
 * Suite de testes da IA do Bot — cobre cada cenário descrito em docs/bot-rules.md
 *
 * Organização por seção do documento:
 *  §2   — Atualização de estado interno (memória)
 *  §3   — Algoritmo de tomada de decisão
 *  §3.1 — Validação soberana do +4
 *  §3.2 — Análise de ameaças e compra forçada
 *  §4   — Desafio ao +4
 *  §5   — Jump-In estratégico
 *  §6   — Decisão sobre carta comprada (DRAW_CHOICE)
 */
import { describe, test, expect, vi } from "vitest";
import {
  BotManager,
  DEFAULT_BOT_DELAY_MS,
  MIN_BOT_DELAY_THRESHOLD_MS,
} from "../bot.manager.ts";
import { BotMemory } from "../bot.memory.ts";
import { COLOR, Type, DefaultState } from "../../game-logic/shared/cards/default.card.ts";
import {
  canPlayDraw4Legally,
  chooseBestCard,
  findJumpInCard,
  findThreateningPlayers,
  isJumpInWorthIt,
  shouldChallengeDraw4,
  shouldDrawInstead,
  shouldPlayDrawnCard,
  type SerializedCard,
} from "../bot.decision.ts";
import { ServerEventArgs } from "../../game-logic/base/server.event.ts";
import type { IBotAgent } from "../bot.types.ts";

class TestServerEvent<T = any> extends ServerEventArgs<T> {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCard(
  id: number,
  color: COLOR | "WILD",
  type: Type,
  value?: number,
): SerializedCard {
  return { id, name: `${color}_${type}_${id}`, color, type, value };
}

function makeBot(
  playerId: number,
  overrides: Partial<IBotAgent> = {},
): IBotAgent {
  const bot: IBotAgent = {
    playerId,
    minTimeout: 400,
    maxTimeout: 1200,
    hasDelay: false,
    memory: new BotMemory(),
    allowedEvents: [],
    allowedCardIds: [],
    rngState: {},
    ...overrides,
  };
  return bot;
}

function createMockState(options: {
  players?: { id: number; hand?: SerializedCard[]; isBot?: boolean }[];
  playerOrder?: number[];
  playerHandCounts?: Map<number, number>;
  topDiscard?: SerializedCard;
  wholeDeck?: SerializedCard[];
  configs?: Record<string, boolean>;
} = {}): DefaultState {
  const playerOrder = options.playerOrder ?? [1, 2, 3, 4];
  const wholeDeck = options.wholeDeck ?? [];
  const topDiscard = options.topDiscard;

  const players = playerOrder.map((id) => {
    const custom = options.players?.find((p) => p.id === id);
    const specifiedCount = options.playerHandCounts?.get(id);
    let hand = custom?.hand ? [...custom.hand] : undefined;
    if (!hand) {
      const count = specifiedCount ?? 7;
      hand = [];
      for (let i = 0; i < count; i++) {
        hand.push({ id: 1000 + id * 100 + i, name: "RED_1", color: COLOR.RED, type: Type.NUMBERED, value: 1 });
      }
    } else if (specifiedCount !== undefined && hand.length < specifiedCount) {
      while (hand.length < specifiedCount) {
        hand.push({ id: 1000 + id * 100 + hand.length, name: "RED_1", color: COLOR.RED, type: Type.NUMBERED, value: 1 });
      }
    }
    return {
      id,
      hand,
      network: { isBot: custom?.isBot ?? false },
    };
  });

  return {
    configs: options.configs ?? { JUMPIN: true, isTestRoom: true },
    room: {
      players,
      turn: { direction: "RIGHT", currentPlayer: { value: { id: playerOrder[0] } } },
      deck: {
        topDiscard,
        wholeDeck,
      },
    },
  } as unknown as DefaultState;
}

// ---------------------------------------------------------------------------
// §2 — Atualização de Estado Interno (BotMemory)
// ---------------------------------------------------------------------------

describe("§2 — BotMemory: Atualização de Estado Interno", () => {
  test("§2.1 — recordCardPlayed remove carta de knownCardIds e incrementa playedColorCounts", () => {
    const mem = new BotMemory();
    mem.recordKnownCards(2, [10, 11]);
    mem.recordCardPlayed(2, 10, COLOR.RED);

    const p2 = mem.getOrCreatePlayerMemory(2);
    expect(p2.knownCardIds.has(10)).toBe(false);
    expect(p2.knownCardIds.has(11)).toBe(true);
    expect(p2.playedColorCounts.get(COLOR.RED)).toBe(1);
  });

  test("§2.2 — recordOptionalDraw adiciona cor ativa a unmatchedColors", () => {
    const mem = new BotMemory();
    mem.recordOptionalDraw(3, COLOR.BLUE);

    const p3 = mem.getOrCreatePlayerMemory(3);
    expect(p3.unmatchedColors.has(COLOR.BLUE)).toBe(true);
  });

  test("§2.3 — recordForcedDraw limpa unmatchedColors mas preserva knownCardIds", () => {
    const mem = new BotMemory();
    mem.recordKnownCards(4, [20, 21]);
    mem.recordOptionalDraw(4, COLOR.GREEN);
    mem.recordForcedDraw(4);

    const p4 = mem.getOrCreatePlayerMemory(4);
    expect(p4.unmatchedColors.size).toBe(0);
    expect(p4.knownCardIds.has(20)).toBe(true);
    expect(p4.knownCardIds.has(21)).toBe(true);
  });

  test("§2.4 — swapPlayerMemories troca knownCardIds e unmatchedColors entre dois jogadores", () => {
    const mem = new BotMemory();
    mem.recordKnownCards(5, [30]);
    mem.recordOptionalDraw(5, COLOR.RED);
    mem.recordKnownCards(6, [40]);
    mem.recordOptionalDraw(6, COLOR.YELLOW);

    mem.swapPlayerMemories(5, 6);

    const p5 = mem.getOrCreatePlayerMemory(5);
    const p6 = mem.getOrCreatePlayerMemory(6);

    expect(p5.knownCardIds.has(40)).toBe(true);
    expect(p6.knownCardIds.has(30)).toBe(true);
    expect(p5.unmatchedColors.has(COLOR.YELLOW)).toBe(true);
    expect(p6.unmatchedColors.has(COLOR.RED)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §3.1 — Validação Soberana do +4
// ---------------------------------------------------------------------------

describe("§3.1 — canPlayDraw4Legally", () => {
  test("retorna false se bot tem carta da cor ativa", () => {
    const deck = [
      makeCard(1, COLOR.RED, Type.NUMBERED, 5),
      makeCard(2, COLOR.WILD, Type.DRAW_4),
    ];
    const bot = makeBot(1);
    const state = createMockState({
      players: [{ id: 1, hand: deck }],
    });

    expect(canPlayDraw4Legally(bot, state, COLOR.RED)).toBe(false);
  });

  test("retorna true se bot não tem carta da cor ativa", () => {
    const deck = [
      makeCard(1, COLOR.BLUE, Type.NUMBERED, 3),
      makeCard(2, COLOR.WILD, Type.DRAW_4),
    ];
    const bot = makeBot(1);
    const state = createMockState({
      players: [{ id: 1, hand: deck }],
    });

    expect(canPlayDraw4Legally(bot, state, COLOR.RED)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §3.2 — Análise de Ameaças: findThreateningPlayers
// ---------------------------------------------------------------------------

describe("§3.2 — findThreateningPlayers", () => {
  test("identifica P+1 (second), P+2 (third) e ignora P+3 sem ameaça", () => {
    const bot = makeBot(1);
    const state = createMockState({
      playerOrder: [1, 2, 3, 4],
      playerHandCounts: new Map([[1, 7], [2, 2], [3, 3], [4, 5]]),
    });

    const threats = findThreateningPlayers(bot, state);
    expect(threats.second).toBe(2); // P+1 com 2 cartas
    expect(threats.third).toBe(3);  // P+2 com 3 cartas
    expect(threats.fourth).toBeUndefined(); // P+3 com 5 cartas — sem ameaça
  });

  test("retorna todos undefined quando nenhum jogador tem menos de 4 cartas", () => {
    const bot = makeBot(1);
    const state = createMockState({
      playerOrder: [1, 2, 3, 4],
      playerHandCounts: new Map([[1, 7], [2, 5], [3, 6], [4, 4]]),
    });

    const threats = findThreateningPlayers(bot, state);
    expect(threats.second).toBeUndefined();
    expect(threats.third).toBeUndefined();
    expect(threats.fourth).toBeUndefined();
  });

  test("identifica P+3 (fourth) como ameaça quando tem menos de 4 cartas", () => {
    const bot = makeBot(1);
    const state = createMockState({
      playerOrder: [1, 2, 3, 4],
      playerHandCounts: new Map([[1, 7], [2, 7], [3, 7], [4, 2]]),
    });

    const threats = findThreateningPlayers(bot, state);
    expect(threats.fourth).toBe(4);
  });

  test("ignora jogadores com 0 cartas (já esvaziaram a mão)", () => {
    const bot = makeBot(1);
    const state = createMockState({
      playerOrder: [1, 2, 3, 4],
      playerHandCounts: new Map([[1, 7], [2, 0], [3, 7], [4, 7]]),
    });

    const threats = findThreateningPlayers(bot, state);
    expect(threats.second).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// §3.2.1 — Escolha de Carta com Ameaça P+1
// ---------------------------------------------------------------------------

describe("§3.2.1 — chooseBestCard com ameaça P+1", () => {
  test("prioriza BLOCK quando P+1 é ameaça", () => {
    const deck = [
      makeCard(1, COLOR.RED, Type.NUMBERED, 5),
      makeCard(2, COLOR.RED, Type.BLOCK),
      makeCard(3, COLOR.BLUE, Type.NUMBERED, 3),
    ];
    const bot = makeBot(1, {
      allowedCardIds: [1, 2, 3],
    });
    const state = createMockState({
      players: [{ id: 1, hand: deck }],
      wholeDeck: deck,
      topDiscard: makeCard(99, COLOR.RED, Type.NUMBERED, 7),
      playerOrder: [1, 2, 3, 4],
      playerHandCounts: new Map([[1, 7], [2, 2], [3, 7], [4, 7]]),
    });

    const threats = findThreateningPlayers(bot, state);
    expect(chooseBestCard(bot, state, threats)).toBe(2); // BLOCK
  });

  test("prioriza carta na unmatchedColor de P+1 sobre carta neutra", () => {
    const deck = [
      makeCard(1, COLOR.RED, Type.NUMBERED, 5),
      makeCard(2, COLOR.GREEN, Type.BLOCK),
      makeCard(3, COLOR.BLUE, Type.NUMBERED, 3),
    ];
    const bot = makeBot(1, {
      allowedCardIds: [1, 2, 3],
    });
    const state = createMockState({
      players: [{ id: 1, hand: deck }],
      wholeDeck: deck,
      topDiscard: makeCard(99, COLOR.RED, Type.NUMBERED, 7),
      playerOrder: [1, 2, 3, 4],
      playerHandCounts: new Map([[1, 7], [2, 2], [3, 7], [4, 7]]),
    });
    bot.memory.recordOptionalDraw(2, COLOR.GREEN); // P+1 não tem GREEN

    const threats = findThreateningPlayers(bot, state);
    expect(chooseBestCard(bot, state, threats)).toBe(2); // BLOCK GREEN (cor que P+1 não tem)
  });
});

// ---------------------------------------------------------------------------
// §3.2.1 — Compra Forçada (shouldDrawInstead)
// ---------------------------------------------------------------------------

describe("§3.2.1 — shouldDrawInstead (compra forçada com P+1 ameaçando)", () => {
  test("retorna true quando todas as cartas são neutras para P+1", () => {
    const deck = [
      makeCard(1, COLOR.RED, Type.NUMBERED, 5),
      makeCard(2, COLOR.BLUE, Type.NUMBERED, 3),
    ];
    const bot = makeBot(1, {
      allowedCardIds: [1, 2],
    });
    const state = createMockState({
      players: [{ id: 1, hand: deck }],
      wholeDeck: deck,
      topDiscard: makeCard(99, COLOR.RED, Type.NUMBERED, 7),
      playerOrder: [1, 2, 3, 4],
      playerHandCounts: new Map([[1, 7], [2, 2], [3, 7], [4, 7]]),
    });
    bot.memory.recordOptionalDraw(2, COLOR.GREEN); // P+1 não tem GREEN; cartas são RED/BLUE

    const threats = findThreateningPlayers(bot, state);
    expect(shouldDrawInstead(bot, state, threats, bot.allowedCardIds)).toBe(true);
  });

  test("retorna false quando há carta bloqueadora disponível", () => {
    const deck = [
      makeCard(1, COLOR.RED, Type.NUMBERED, 5),
      makeCard(2, COLOR.RED, Type.DRAW_2),
    ];
    const bot = makeBot(1, {
      allowedCardIds: [1, 2],
    });
    const state = createMockState({
      players: [{ id: 1, hand: deck }],
      wholeDeck: deck,
      topDiscard: makeCard(99, COLOR.RED, Type.NUMBERED, 7),
      playerOrder: [1, 2, 3, 4],
      playerHandCounts: new Map([[1, 7], [2, 2], [3, 7], [4, 7]]),
    });

    const threats = findThreateningPlayers(bot, state);
    expect(shouldDrawInstead(bot, state, threats, bot.allowedCardIds)).toBe(false);
  });

  test("retorna false quando há carta na unmatchedColor de P+1", () => {
    const deck = [
      makeCard(1, COLOR.GREEN, Type.NUMBERED, 5),
    ];
    const bot = makeBot(1, {
      allowedCardIds: [1],
    });
    const state = createMockState({
      players: [{ id: 1, hand: deck }],
      wholeDeck: deck,
      topDiscard: makeCard(99, COLOR.RED, Type.NUMBERED, 7),
      playerOrder: [1, 2, 3, 4],
      playerHandCounts: new Map([[1, 7], [2, 2], [3, 7], [4, 7]]),
    });
    bot.memory.recordOptionalDraw(2, COLOR.GREEN); // P+1 não tem GREEN e bot tem GREEN

    const threats = findThreateningPlayers(bot, state);
    expect(shouldDrawInstead(bot, state, threats, bot.allowedCardIds)).toBe(false);
  });

  test("retorna false quando não há ameaça P+1", () => {
    const deck = [makeCard(1, COLOR.RED, Type.NUMBERED, 5)];
    const bot = makeBot(1, {
      allowedCardIds: [1],
    });
    const state = createMockState({
      players: [{ id: 1, hand: deck }],
      wholeDeck: deck,
      playerOrder: [1, 2, 3, 4],
      playerHandCounts: new Map([[1, 7], [2, 7], [3, 7], [4, 7]]),
    });

    const threats = findThreateningPlayers(bot, state);
    expect(shouldDrawInstead(bot, state, threats, bot.allowedCardIds)).toBe(false);
  });

  test("retorna false quando deck e discardPile estão vazios", () => {
    const deck = [makeCard(1, COLOR.RED, Type.NUMBERED, 5)];
    const bot = makeBot(1, {
      allowedCardIds: [1],
    });
    const state = createMockState({
      players: [{ id: 1, hand: deck }],
      wholeDeck: deck,
      topDiscard: makeCard(99, COLOR.RED, Type.NUMBERED, 7),
      playerOrder: [1, 2, 3, 4],
      playerHandCounts: new Map([[1, 7], [2, 2], [3, 7], [4, 7]]),
    });
    // Simula baralho e descarte totalmente vazios
    (state.room.deck as any).deck = [];
    (state.room.deck as any).discardPile = [];
    bot.memory.recordOptionalDraw(2, COLOR.GREEN);

    const threats = findThreateningPlayers(bot, state);
    expect(shouldDrawInstead(bot, state, threats, bot.allowedCardIds)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §3.2.2 — Ameaça P+2
// ---------------------------------------------------------------------------

describe("§3.2.2 — chooseBestCard com ameaça P+2", () => {
  test("usa +2 na unmatchedColor de P+2 quando P+2 é ameaça e P+1 não é", () => {
    const deck = [
      makeCard(1, COLOR.RED, Type.NUMBERED, 5),
      makeCard(2, COLOR.GREEN, Type.DRAW_2),
      makeCard(3, COLOR.BLUE, Type.NUMBERED, 3),
    ];
    const bot = makeBot(1, {
      allowedCardIds: [1, 2, 3],
    });
    const state = createMockState({
      players: [{ id: 1, hand: deck }],
      wholeDeck: deck,
      topDiscard: makeCard(99, COLOR.RED, Type.NUMBERED, 7),
      playerOrder: [1, 2, 3, 4],
      playerHandCounts: new Map([[1, 7], [2, 7], [3, 2], [4, 7]]),
    });
    bot.memory.recordOptionalDraw(3, COLOR.GREEN); // P+2 não tem GREEN

    const threats = findThreateningPlayers(bot, state);
    expect(chooseBestCard(bot, state, threats)).toBe(2); // DRAW_2 GREEN
  });
});

// ---------------------------------------------------------------------------
// §3.2.3 — Ameaça P+3: NÃO usa REVERSE
// ---------------------------------------------------------------------------

describe("§3.2.3 — chooseBestCard com ameaça P+3", () => {
  test("NÃO escolhe REVERSE quando P+3 é ameaça", () => {
    const deck = [
      makeCard(1, COLOR.RED, Type.NUMBERED, 5),
      makeCard(2, COLOR.RED, Type.REVERSE),
      makeCard(3, COLOR.GREEN, Type.NUMBERED, 2),
    ];
    const bot = makeBot(1, {
      allowedCardIds: [1, 2, 3],
    });
    const state = createMockState({
      players: [{ id: 1, hand: deck }],
      wholeDeck: deck,
      topDiscard: makeCard(99, COLOR.RED, Type.NUMBERED, 7),
      playerOrder: [1, 2, 3, 4],
      playerHandCounts: new Map([[1, 7], [2, 7], [3, 7], [4, 2]]),
    });
    bot.memory.recordOptionalDraw(4, COLOR.GREEN); // P+3 não tem GREEN

    const threats = findThreateningPlayers(bot, state);
    const cardId = chooseBestCard(bot, state, threats);
    expect(cardId).not.toBe(2);  // não deve ser o REVERSE
    expect(cardId).toBe(3);      // deve ser a carta GREEN (cor que P+3 não tem)
  });
});

// ---------------------------------------------------------------------------
// §3.2.4 — Modo Padrão
// ---------------------------------------------------------------------------

describe("§3.2.4 — chooseBestCard modo padrão (sem ameaças)", () => {
  test("escolhe carta da cor mais abundante (mais à direita no array)", () => {
    const deck = [
      makeCard(1, COLOR.RED, Type.NUMBERED, 1),
      makeCard(2, COLOR.RED, Type.NUMBERED, 2),
      makeCard(3, COLOR.RED, Type.NUMBERED, 3),
      makeCard(4, COLOR.BLUE, Type.NUMBERED, 1),
    ];
    const bot = makeBot(1, {
      allowedCardIds: [1, 2, 3, 4],
    });
    const state = createMockState({
      players: [{ id: 1, hand: deck }],
      wholeDeck: deck,
      topDiscard: makeCard(99, COLOR.RED, Type.NUMBERED, 5),
      playerOrder: [1, 2, 3, 4],
      playerHandCounts: new Map([[1, 7], [2, 7], [3, 7], [4, 7]]),
    });

    const threats = findThreateningPlayers(bot, state);
    expect(chooseBestCard(bot, state, threats)).toBe(3); // RED mais à direita
  });
});

// ---------------------------------------------------------------------------
// §4 — Desafio ao +4
// ---------------------------------------------------------------------------

describe("§4 — shouldChallengeDraw4", () => {
  test("desafia quando knownCardIds prova que oponente tinha a cor anterior", () => {
    const deck = [makeCard(10, COLOR.RED, Type.NUMBERED, 5)];
    const bot = makeBot(1);
    const state = createMockState({
      wholeDeck: deck,
      playerHandCounts: new Map([[2, 7]]),
    });
    bot.memory.recordKnownCards(2, [10]); // bot sabe que jogador 2 tinha a carta 10 (RED)

    expect(shouldChallengeDraw4(bot, state, 2, COLOR.RED)).toBe(true);
  });

  test("NÃO desafia quando playedColorCounts >= 3 na cor anterior (exaustão da cor -> jogada honesta)", () => {
    const bot = makeBot(1);
    const state = createMockState({
      wholeDeck: [],
      playerHandCounts: new Map([[2, 7]]),
    });
    bot.memory.getOrCreatePlayerMemory(2).playedColorCounts.set(COLOR.RED, 3);

    expect(shouldChallengeDraw4(bot, state, 2, COLOR.RED)).toBe(false);
  });

  test("desafia quando oponente tem < 4 cartas e sem informação em unmatchedColors", () => {
    const bot = makeBot(1);
    const state = createMockState({
      wholeDeck: [],
      playerHandCounts: new Map([[2, 3]]),
    });

    expect(shouldChallengeDraw4(bot, state, 2, COLOR.RED)).toBe(true);
  });

  test("NÃO desafia quando cor anterior está em unmatchedColors do oponente", () => {
    const bot = makeBot(1);
    const state = createMockState({
      wholeDeck: [],
      playerHandCounts: new Map([[2, 7]]),
    });
    bot.memory.recordOptionalDraw(2, COLOR.RED); // bot sabe que oponente não tinha RED

    expect(shouldChallengeDraw4(bot, state, 2, COLOR.RED)).toBe(false);
  });

  test("NÃO desafia em caso de dúvida padrão (sem evidências)", () => {
    const bot = makeBot(1);
    const state = createMockState({
      wholeDeck: [],
      playerHandCounts: new Map([[2, 7]]),
    });

    expect(shouldChallengeDraw4(bot, state, 2, COLOR.BLUE)).toBe(false);
  });

  test("desafia quando lastActivePlayerId é 0 e knownCardIds prova que oponente tinha a cor anterior", () => {
    const deck = [makeCard(10, COLOR.RED, Type.NUMBERED, 5)];
    const bot = makeBot(1);
    const state = createMockState({
      wholeDeck: deck,
      playerHandCounts: new Map([[0, 7]]),
    });
    bot.memory.recordKnownCards(0, [10]);

    expect(shouldChallengeDraw4(bot, state, 0, COLOR.RED)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §5 — Jump-In: findJumpInCard
// ---------------------------------------------------------------------------

describe("§5 — findJumpInCard", () => {
  test("retorna carta com mesma cor, tipo e valor (carta idêntica)", () => {
    const discarded = makeCard(10, COLOR.RED, Type.NUMBERED, 7);
    const deck = [
      makeCard(20, COLOR.RED, Type.NUMBERED, 7),   // idêntica
      makeCard(21, COLOR.RED, Type.NUMBERED, 5),   // valor diferente
      makeCard(22, COLOR.BLUE, Type.NUMBERED, 7),  // cor diferente
    ];
    const bot = makeBot(1);
    const state = createMockState({
      players: [{ id: 1, hand: deck }],
      topDiscard: discarded,
    });

    const card = findJumpInCard(bot, state);
    expect(card?.id).toBe(20);
  });

  test("retorna undefined quando não há carta idêntica", () => {
    const discarded = makeCard(10, COLOR.RED, Type.NUMBERED, 7);
    const deck = [
      makeCard(20, COLOR.RED, Type.NUMBERED, 5),
      makeCard(21, COLOR.BLUE, Type.NUMBERED, 7),
    ];
    const bot = makeBot(1);
    const state = createMockState({
      players: [{ id: 1, hand: deck }],
      topDiscard: discarded,
    });

    expect(findJumpInCard(bot, state)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// §5.1 — Avaliação Estratégica do Jump-In (isJumpInWorthIt)
// ---------------------------------------------------------------------------

describe("§5.1 — isJumpInWorthIt", () => {
  test("retorna true sem ameaça P+1 — bot sempre tenta Jump-In", () => {
    const jumpCard = makeCard(20, COLOR.RED, Type.NUMBERED, 5);
    const bot = makeBot(1);
    const state = createMockState({
      playerOrder: [1, 2, 3, 4],
      playerHandCounts: new Map([[1, 7], [2, 7], [3, 7], [4, 7]]),
    });

    const threats = findThreateningPlayers(bot, state);
    expect(isJumpInWorthIt(bot, jumpCard, threats)).toBe(true);
  });

  test("retorna true quando carta de Jump-In é BLOCK e P+1 é ameaça", () => {
    const jumpCard = makeCard(20, COLOR.RED, Type.BLOCK);
    const bot = makeBot(1);
    const state = createMockState({
      playerOrder: [1, 2, 3, 4],
      playerHandCounts: new Map([[1, 7], [2, 2], [3, 7], [4, 7]]),
    });

    const threats = findThreateningPlayers(bot, state);
    expect(isJumpInWorthIt(bot, jumpCard, threats)).toBe(true);
  });

  test("retorna true quando carta de Jump-In é DRAW_2 e P+1 é ameaça", () => {
    const jumpCard = makeCard(20, COLOR.RED, Type.DRAW_2);
    const bot = makeBot(1);
    const state = createMockState({
      playerOrder: [1, 2, 3, 4],
      playerHandCounts: new Map([[1, 7], [2, 2], [3, 7], [4, 7]]),
    });

    const threats = findThreateningPlayers(bot, state);
    expect(isJumpInWorthIt(bot, jumpCard, threats)).toBe(true);
  });

  test("retorna true quando cor do Jump-In está em unmatchedColors de P+1", () => {
    const jumpCard = makeCard(20, COLOR.GREEN, Type.NUMBERED, 4);
    const bot = makeBot(1);
    const state = createMockState({
      playerOrder: [1, 2, 3, 4],
      playerHandCounts: new Map([[1, 7], [2, 2], [3, 7], [4, 7]]),
    });
    bot.memory.recordOptionalDraw(2, COLOR.GREEN); // P+1 não tem GREEN

    const threats = findThreateningPlayers(bot, state);
    expect(isJumpInWorthIt(bot, jumpCard, threats)).toBe(true);
  });

  test("retorna false quando carta é neutra e P+1 é ameaça", () => {
    const jumpCard = makeCard(20, COLOR.RED, Type.NUMBERED, 5);
    const bot = makeBot(1);
    const state = createMockState({
      playerOrder: [1, 2, 3, 4],
      playerHandCounts: new Map([[1, 7], [2, 2], [3, 7], [4, 7]]),
    });
    bot.memory.recordOptionalDraw(2, COLOR.BLUE); // P+1 não tem BLUE, mas jumpCard é RED

    const threats = findThreateningPlayers(bot, state);
    expect(isJumpInWorthIt(bot, jumpCard, threats)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §6 — Decisão sobre Carta Comprada (shouldPlayDrawnCard)
// ---------------------------------------------------------------------------

describe("§6 — shouldPlayDrawnCard (KEEP_EVENT / DRAW_CHOICE)", () => {
  test("sem ameaças: joga carta da cor ativa", () => {
    const drawnCard = makeCard(50, COLOR.RED, Type.NUMBERED, 3);
    const bot = makeBot(1);
    const state = createMockState({
      topDiscard: makeCard(99, COLOR.RED, Type.NUMBERED, 7),
      playerOrder: [1, 2, 3, 4],
      playerHandCounts: new Map([[1, 7], [2, 7], [3, 7], [4, 7]]),
    });

    const threats = findThreateningPlayers(bot, state);
    expect(shouldPlayDrawnCard(bot, state, drawnCard, threats)).toBe(true);
  });

  test("sem ameaças: guarda carta de cor diferente (não jogável)", () => {
    const drawnCard = makeCard(50, COLOR.BLUE, Type.NUMBERED, 3);
    const bot = makeBot(1);
    const state = createMockState({
      topDiscard: makeCard(99, COLOR.RED, Type.NUMBERED, 7),
      playerOrder: [1, 2, 3, 4],
      playerHandCounts: new Map([[1, 7], [2, 7], [3, 7], [4, 7]]),
    });

    const threats = findThreateningPlayers(bot, state);
    expect(shouldPlayDrawnCard(bot, state, drawnCard, threats)).toBe(false);
  });

  test("com ameaça P+1: joga BLOCK comprado", () => {
    const drawnCard = makeCard(50, COLOR.RED, Type.BLOCK);
    const bot = makeBot(1);
    const state = createMockState({
      topDiscard: makeCard(99, COLOR.RED, Type.NUMBERED, 7),
      playerOrder: [1, 2, 3, 4],
      playerHandCounts: new Map([[1, 7], [2, 2], [3, 7], [4, 7]]),
    });

    const threats = findThreateningPlayers(bot, state);
    expect(shouldPlayDrawnCard(bot, state, drawnCard, threats)).toBe(true);
  });

  test("com ameaça P+1: joga DRAW_2 comprado", () => {
    const drawnCard = makeCard(50, COLOR.RED, Type.DRAW_2);
    const bot = makeBot(1);
    const state = createMockState({
      topDiscard: makeCard(99, COLOR.RED, Type.NUMBERED, 7),
      playerOrder: [1, 2, 3, 4],
      playerHandCounts: new Map([[1, 7], [2, 2], [3, 7], [4, 7]]),
    });

    const threats = findThreateningPlayers(bot, state);
    expect(shouldPlayDrawnCard(bot, state, drawnCard, threats)).toBe(true);
  });

  test("com ameaça P+1: guarda carta neutra (não bloqueia e não está em unmatchedColors)", () => {
    const drawnCard = makeCard(50, COLOR.RED, Type.NUMBERED, 9);
    const bot = makeBot(1);
    const state = createMockState({
      topDiscard: makeCard(99, COLOR.RED, Type.NUMBERED, 7),
      playerOrder: [1, 2, 3, 4],
      playerHandCounts: new Map([[1, 7], [2, 2], [3, 7], [4, 7]]),
    });
    bot.memory.recordOptionalDraw(2, COLOR.BLUE); // P+1 não tem BLUE; drawnCard é RED (neutra)

    const threats = findThreateningPlayers(bot, state);
    expect(shouldPlayDrawnCard(bot, state, drawnCard, threats)).toBe(false);
  });

  test("com ameaça P+1: joga carta comprada que está na unmatchedColor de P+1", () => {
    const drawnCard = makeCard(50, COLOR.BLUE, Type.NUMBERED, 2);
    const bot = makeBot(1);
    const state = createMockState({
      topDiscard: makeCard(99, COLOR.RED, Type.NUMBERED, 7),
      playerOrder: [1, 2, 3, 4],
      playerHandCounts: new Map([[1, 7], [2, 2], [3, 7], [4, 7]]),
    });
    bot.memory.recordOptionalDraw(2, COLOR.BLUE); // P+1 não tem BLUE — drawnCard é BLUE

    const threats = findThreateningPlayers(bot, state);
    expect(shouldPlayDrawnCard(bot, state, drawnCard, threats)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// BotManager — Gestão Centralizada de Bots e Integração via sendToPlayer
// ---------------------------------------------------------------------------

describe("BotManager — Gestão Centralizada de Bots e Integração via sendToPlayer", () => {
  test("gerencia bots e invalida no reconectar de humano", () => {
    const manager = new BotManager();
    const bot = manager.getOrCreateBot(1);
    expect(bot.playerId).toBe(1);
    expect(manager.getRegisteredBots().has(1)).toBe(true);

    manager.removeBot(1);
    expect(manager.getRegisteredBots().has(1)).toBe(false);
  });

  test("chama onBotServerEvent via PlayerSocketImpl.sendToPlayer se isBot === true", () => {
    const manager = new BotManager();
    let handledEvent: string | undefined;

    const mockState = createMockState({
      players: [
        { id: 1, hand: [makeCard(100, COLOR.RED, Type.NUMBERED, 5)], isBot: true },
      ],
      wholeDeck: [makeCard(100, COLOR.RED, Type.NUMBERED, 5)],
      topDiscard: makeCard(99, COLOR.RED, Type.NUMBERED, 7),
    });

    const mockEventManager = {
      handleClientEvent: (name: string) => {
        handledEvent = name;
      },
    } as any;
    manager.handleClientEvent = (name: string) => {
      handledEvent = name;
    };

    const socket: any = {
      isBot: true,
      onBotServerEvent: undefined,
      sendToPlayer(event: any) {
        if (this.isBot && this.onBotServerEvent) {
          this.onBotServerEvent(event);
        }
      },
    };

    manager.registerBotSocket(1, socket, mockState, mockEventManager);

    socket.onBotServerEvent = (event: any) => {
      manager.onBotServerEvent(1, event, mockState, mockEventManager);
    };

    socket.sendToPlayer(
      new TestServerEvent("PERMISSIONS", null, [], {
        playerId: 1,
        allowedEvents: [[], ["client:PLAY_CARD"]],
        allowedCards: [100],
      }),
    );

    expect(handledEvent).toBe("client:PLAY_CARD");
  });

  test("executa decisão de turno lendo o estado global diretamente sem duplicação", () => {
    const manager = new BotManager();
    const mockState = createMockState({
      players: [
        { id: 1, hand: [makeCard(100, COLOR.RED, Type.NUMBERED, 5)], isBot: true },
        { id: 2, hand: [makeCard(200, COLOR.BLUE, Type.NUMBERED, 7)], isBot: false },
      ],
      wholeDeck: [
        makeCard(100, COLOR.RED, Type.NUMBERED, 5),
        makeCard(99, COLOR.RED, Type.NUMBERED, 7),
      ],
      topDiscard: makeCard(99, COLOR.RED, Type.NUMBERED, 7),
      playerOrder: [1, 2],
      playerHandCounts: new Map([[1, 7], [2, 7]]),
    });

    let dispatchedEvent: string | undefined;
    const mockEventManager = {
      handleClientEvent: (name: string) => {
        dispatchedEvent = name;
      },
    } as any;
    manager.handleClientEvent = (name: string) => {
      dispatchedEvent = name;
    };

    manager.onBotServerEvent(
      1,
      new TestServerEvent("PERMISSIONS", null, [], {
        playerId: 1,
        allowedEvents: [[], ["client:PLAY_CARD"]],
        allowedCards: [100],
      }),
      mockState,
      mockEventManager,
    );

    expect(dispatchedEvent).toBe("client:PLAY_CARD");
  });

  test("despacha client:KEEP_EVENT ao decidir manter a carta comprada na mão", () => {
    const manager = new BotManager();
    const bot = manager.getOrCreateBot(1);

    const mockState = createMockState({
      players: [
        { id: 1, hand: [makeCard(100, COLOR.RED, Type.NUMBERED, 5), makeCard(101, COLOR.BLUE, Type.NUMBERED, 8)], isBot: true },
        { id: 2, hand: [makeCard(200, COLOR.BLUE, Type.NUMBERED, 7)], isBot: false },
      ],
      wholeDeck: [
        makeCard(100, COLOR.RED, Type.NUMBERED, 5),
        makeCard(101, COLOR.BLUE, Type.NUMBERED, 8),
        makeCard(99, COLOR.RED, Type.NUMBERED, 7),
      ],
      topDiscard: makeCard(99, COLOR.RED, Type.NUMBERED, 7),
      playerOrder: [1, 2],
      playerHandCounts: new Map([[1, 7], [2, 2]]),
    });

    bot.memory.recordOptionalDraw(2, COLOR.GREEN);
    bot.lastDrawnCard = makeCard(101, COLOR.BLUE, Type.NUMBERED, 8);

    let dispatchedEvent: string | undefined;
    const mockEventManager = {
      handleClientEvent: (name: string) => {
        dispatchedEvent = name;
      },
    } as any;
    manager.handleClientEvent = (name: string) => {
      dispatchedEvent = name;
    };

    manager.onBotServerEvent(
      1,
      new TestServerEvent("PERMISSIONS", null, [], {
        playerId: 1,
        allowedEvents: [[], ["client:KEEP_EVENT", "client:PLAY_CARD"]],
        allowedCards: [101],
      }),
      mockState,
      mockEventManager,
    );

    expect(dispatchedEvent).toBe("client:KEEP_EVENT");
  });

  test("decisão pós-compra: seleciona a última carta comprada que pode ser jogada ao invés da primeira", () => {
    const manager = new BotManager();
    const unplayableCard = makeCard(32, COLOR.BLUE, Type.DRAW_2);
    const playableCard = makeCard(97, COLOR.YELLOW, Type.NUMBERED, 7);

    const mockState = createMockState({
      players: [
        { id: 1, hand: [unplayableCard, playableCard], isBot: true },
        { id: 2, hand: [makeCard(200, COLOR.BLUE, Type.NUMBERED, 5)], isBot: false },
      ],
      wholeDeck: [unplayableCard, playableCard],
      topDiscard: makeCard(71, COLOR.GREEN, Type.NUMBERED, 7),
      playerOrder: [1, 2],
      playerHandCounts: new Map([[1, 2], [2, 7]]),
    });

    let dispatchedEvent: string | undefined;
    let dispatchedData: any;
    manager.handleClientEvent = (name: string, data: any) => {
      dispatchedEvent = name;
      dispatchedData = data;
    };

    // 1. Servidor envia CARD_DRAW com 2 cartas: [32 (unplayable), 97 (playable 7)]
    manager.onBotServerEvent(
      1,
      new TestServerEvent("CARD_DRAW", null, [], {
        playerId: 1,
        quantity: 2,
        cards: [unplayableCard, playableCard],
      }),
      mockState,
      {} as any,
    );

    // 2. Servidor envia PERMISSIONS com PLAY_CARD e KEEP_EVENT, permitindo apenas a carta 97
    manager.onBotServerEvent(
      1,
      new TestServerEvent("PERMISSIONS", null, [], {
        playerId: 1,
        allowedEvents: [[], ["client:PLAY_CARD", "client:KEEP_EVENT"]],
        allowedCards: [playableCard],
      }),
      mockState,
      {} as any,
    );

    expect(dispatchedEvent).toBe("client:PLAY_CARD");
    expect(dispatchedData).toEqual({ cardId: 97, saidUno: true });
  });

  test("despacha client:SELECT_HAND com atributo targetId", () => {
    const manager = new BotManager();
    const mockState = createMockState({
      players: [
        { id: 1, hand: [makeCard(100, COLOR.RED, Type.NUMBERED, 5)], isBot: true },
        { id: 2, hand: [makeCard(200, COLOR.BLUE, Type.NUMBERED, 7)], isBot: false },
      ],
      playerOrder: [1, 2],
      playerHandCounts: new Map([[1, 1], [2, 5]]),
    });

    let dispatchedEvent: string | undefined;
    let dispatchedData: any;
    manager.handleClientEvent = (name: string, data: any) => {
      dispatchedEvent = name;
      dispatchedData = data;
    };

    manager.onBotServerEvent(
      1,
      new TestServerEvent("PERMISSIONS", null, [], {
        playerId: 1,
        allowedEvents: [[], ["client:SELECT_HAND"]],
        allowedCards: [],
      }),
      mockState,
      {} as any,
    );

    expect(dispatchedEvent).toBe("client:SELECT_HAND");
    expect(dispatchedData).toEqual({ targetId: 2 });
  });

  test("despacha client:CHALLENGE com { challenge: true } quando decide desafiar", () => {
    const manager = new BotManager();
    const bot = manager.getOrCreateBot(1);
    const mockState = createMockState({
      players: [
        { id: 0, hand: [makeCard(10, COLOR.RED, Type.NUMBERED, 5)], isBot: false },
        { id: 1, hand: [makeCard(100, COLOR.BLUE, Type.NUMBERED, 2)], isBot: true },
      ],
      wholeDeck: [makeCard(10, COLOR.RED, Type.NUMBERED, 5)],
      playerOrder: [0, 1],
      playerHandCounts: new Map([[0, 7], [1, 7]]),
      topDiscard: makeCard(50, COLOR.WILD, Type.DRAW_4),
    });

    // Simula que jogador 0 jogou uma carta vermelha anteriormente
    manager.onBotServerEvent(
      1,
      new TestServerEvent("BROADCAST:client:PLAY_CARD", { id: 0 }, [], {
        card: makeCard(9, COLOR.RED, Type.NUMBERED, 1),
      }),
      createMockState({
        topDiscard: makeCard(9, COLOR.RED, Type.NUMBERED, 1),
      }),
      {} as any,
    );

    // Bot sabe que jogador 0 tinha a carta 10 (RED)
    bot.memory.recordKnownCards(0, [10]);

    let dispatchedEvent: string | undefined;
    let dispatchedData: any;
    manager.handleClientEvent = (name: string, data: any) => {
      dispatchedEvent = name;
      dispatchedData = data;
    };

    manager.onBotServerEvent(
      1,
      new TestServerEvent("PERMISSIONS", null, [], {
        playerId: 1,
        allowedEvents: [[], ["client:PLAY_CARD", "client:DRAW_CHOICE", "client:CHALLENGE"]],
        allowedCards: [],
      }),
      mockState,
      {} as any,
    );

    expect(dispatchedEvent).toBe("client:CHALLENGE");
    expect(dispatchedData).toEqual({ challenge: true });
  });

  test("NÃO despacha client:CHALLENGE com { challenge: false } quando decide não desafiar; opta por PLAY_CARD ou DRAW_CHOICE", () => {
    const manager = new BotManager();
    const playableCard = makeCard(100, COLOR.BLUE, Type.NUMBERED, 2);
    const mockState = createMockState({
      players: [
        { id: 0, hand: [makeCard(10, COLOR.RED, Type.NUMBERED, 5)], isBot: false },
        { id: 1, hand: [playableCard], isBot: true },
      ],
      wholeDeck: [playableCard],
      playerOrder: [0, 1],
      playerHandCounts: new Map([[0, 7], [1, 7]]),
      topDiscard: makeCard(50, COLOR.WILD, Type.DRAW_4),
    });

    let dispatchedEvent: string | undefined;
    let dispatchedData: any;
    manager.handleClientEvent = (name: string, data: any) => {
      dispatchedEvent = name;
      dispatchedData = data;
    };

    // Bot tem permissão para PLAY_CARD, DRAW_CHOICE e CHALLENGE, mas não quer desafiar
    manager.onBotServerEvent(
      1,
      new TestServerEvent("PERMISSIONS", null, [], {
        playerId: 1,
        allowedEvents: [[], ["client:PLAY_CARD", "client:DRAW_CHOICE", "client:CHALLENGE"]],
        allowedCards: [playableCard],
      }),
      mockState,
      {} as any,
    );

    expect(dispatchedEvent).not.toBe("client:CHALLENGE");
    expect(dispatchedEvent).toBe("client:PLAY_CARD");
    expect(dispatchedData).toEqual({ cardId: 100 });
  });

  test("NÃO despacha client:CHALLENGE com { challenge: false } quando decide não desafiar e não pode jogar; opta por DRAW_CHOICE", () => {
    const manager = new BotManager();
    const mockState = createMockState({
      players: [
        { id: 0, hand: [makeCard(10, COLOR.RED, Type.NUMBERED, 5)], isBot: false },
        { id: 1, hand: [makeCard(100, COLOR.BLUE, Type.NUMBERED, 2)], isBot: true },
      ],
      wholeDeck: [],
      playerOrder: [0, 1],
      playerHandCounts: new Map([[0, 7], [1, 7]]),
      topDiscard: makeCard(50, COLOR.WILD, Type.DRAW_4),
    });

    let dispatchedEvent: string | undefined;
    let dispatchedData: any;
    manager.handleClientEvent = (name: string, data: any) => {
      dispatchedEvent = name;
      dispatchedData = data;
    };

    // Bot tem permissão para DRAW_CHOICE e CHALLENGE, sem cartas jogáveis
    manager.onBotServerEvent(
      1,
      new TestServerEvent("PERMISSIONS", null, [], {
        playerId: 1,
        allowedEvents: [[], ["client:DRAW_CHOICE", "client:CHALLENGE"]],
        allowedCards: [],
      }),
      mockState,
      {} as any,
    );

    expect(dispatchedEvent).not.toBe("client:CHALLENGE");
    expect(dispatchedEvent).toBe("client:DRAW_CHOICE");
    expect(dispatchedData).toEqual({});
  });

  test("Jump-In: agenda timer e despacha client:JUMP_IN com targetId e cardJumpedId", () => {
    vi.useFakeTimers();
    try {
      const manager = new BotManager(100, 200);
      const matchingCard = makeCard(105, COLOR.RED, Type.NUMBERED, 7);
      const topCard = makeCard(99, COLOR.RED, Type.NUMBERED, 7);

      const mockState = createMockState({
        players: [
          { id: 1, hand: [makeCard(100, COLOR.BLUE, Type.NUMBERED, 2)], isBot: false },
          { id: 2, hand: [matchingCard], isBot: true },
        ],
        playerOrder: [1, 2],
        playerHandCounts: new Map([[1, 7], [2, 7]]),
        topDiscard: topCard,
        configs: { JUMPIN: true },
      });

      let dispatchedEvent: string | undefined;
      let dispatchedData: any;
      manager.handleClientEvent = (name: string, data: any) => {
        dispatchedEvent = name;
        dispatchedData = data;
      };

      // Player 1 joga carta e servidor envia BROADCAST:client:PLAY_CARD
      manager.onBotServerEvent(
        2,
        new TestServerEvent("BROADCAST:client:PLAY_CARD", { id: 1 } as any, [], {
          card: topCard,
        }),
        mockState,
        {} as any,
      );

      const bot = manager.getRegisteredBots().get(2);
      expect(bot?.actionTimer).toBeDefined();

      // Avança o tempo além do timer do bot
      vi.advanceTimersByTime(250);

      expect(dispatchedEvent).toBe("client:JUMP_IN");
      expect(dispatchedData).toEqual({
        cardJumpedId: 105,
        targetId: 99,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test("Jump-In: cancela timer ao receber confirmação BROADCAST:client:JUMP_IN do servidor", () => {
    vi.useFakeTimers();
    try {
      const manager = new BotManager(100, 200);
      const matchingCard = makeCard(105, COLOR.RED, Type.NUMBERED, 7);
      const topCard = makeCard(99, COLOR.RED, Type.NUMBERED, 7);

      const mockState = createMockState({
        players: [
          { id: 1, hand: [makeCard(100, COLOR.BLUE, Type.NUMBERED, 2)], isBot: false },
          { id: 2, hand: [matchingCard], isBot: true },
        ],
        playerOrder: [1, 2],
        playerHandCounts: new Map([[1, 7], [2, 7]]),
        topDiscard: topCard,
        configs: { JUMPIN: true },
      });

      let dispatchedEvent: string | undefined;
      manager.handleClientEvent = (name: string) => {
        dispatchedEvent = name;
      };

      manager.onBotServerEvent(
        2,
        new TestServerEvent("BROADCAST:client:PLAY_CARD", { id: 1 } as any, [], {
          card: topCard,
        }),
        mockState,
        {} as any,
      );

      const bot = manager.getRegisteredBots().get(2);
      expect(bot?.actionTimer).toBeDefined();

      // Confirmação de Jump-In chega antes do timer disparar
      manager.onBotServerEvent(
        2,
        new TestServerEvent("BROADCAST:client:JUMP_IN", { id: 3 } as any, [], {
          target: topCard,
          cardJumpedIn: matchingCard,
        }),
        mockState,
        {} as any,
      );

      expect(bot?.actionTimer).toBeUndefined();

      vi.advanceTimersByTime(250);
      expect(dispatchedEvent).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  test("Jump-In: cancela timer ao receber novo evento PERMISSIONS sem client:JUMP_IN", () => {
    vi.useFakeTimers();
    try {
      const manager = new BotManager(100, 200);
      const matchingCard = makeCard(105, COLOR.RED, Type.NUMBERED, 7);
      const topCard = makeCard(99, COLOR.RED, Type.NUMBERED, 7);

      const mockState = createMockState({
        players: [
          { id: 1, hand: [makeCard(100, COLOR.BLUE, Type.NUMBERED, 2)], isBot: false },
          { id: 2, hand: [matchingCard], isBot: true },
        ],
        playerOrder: [1, 2],
        playerHandCounts: new Map([[1, 7], [2, 7]]),
        topDiscard: topCard,
        configs: { JUMPIN: true },
      });

      let dispatchedEvent: string | undefined;
      manager.handleClientEvent = (name: string) => {
        dispatchedEvent = name;
      };

      manager.onBotServerEvent(
        2,
        new TestServerEvent("BROADCAST:client:PLAY_CARD", { id: 1 } as any, [], {
          card: topCard,
        }),
        mockState,
        {} as any,
      );

      const bot = manager.getRegisteredBots().get(2);
      expect(bot?.actionTimer).toBeDefined();

      // Novo evento de PERMISSIONS chega (ex: timeout expirou e mudou o turno)
      manager.onBotServerEvent(
        2,
        new TestServerEvent("PERMISSIONS", null, [], {
          playerId: 1,
          allowedEvents: [[], ["client:PLAY_CARD"], ["client:DRAW_CHOICE"]],
          allowedCards: [],
        }),
        mockState,
        {} as any,
      );

      expect(bot?.actionTimer).toBeUndefined();

      vi.advanceTimersByTime(250);
      expect(dispatchedEvent).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  test("UNO: envia saidUno: true ao jogar carta tendo exatamente 2 cartas na mão (jogada de turno normal)", () => {
    const manager = new BotManager();
    const card1 = makeCard(100, COLOR.RED, Type.NUMBERED, 5);
    const card2 = makeCard(101, COLOR.BLUE, Type.NUMBERED, 7);
    const mockState = createMockState({
      players: [
        { id: 1, hand: [card1, card2], isBot: true },
        { id: 2, hand: [makeCard(200, COLOR.BLUE, Type.NUMBERED, 2)], isBot: false },
      ],
      playerOrder: [1, 2],
      playerHandCounts: new Map([[1, 2], [2, 5]]),
      topDiscard: makeCard(99, COLOR.RED, Type.NUMBERED, 3),
    });

    let dispatchedEvent: string | undefined;
    let dispatchedData: any;
    manager.handleClientEvent = (name: string, data: any) => {
      dispatchedEvent = name;
      dispatchedData = data;
    };

    manager.onBotServerEvent(
      1,
      new TestServerEvent("PERMISSIONS", null, [], {
        playerId: 1,
        allowedEvents: [[], ["client:PLAY_CARD"]],
        allowedCards: [card1],
      }),
      mockState,
      {} as any,
    );

    expect(dispatchedEvent).toBe("client:PLAY_CARD");
    expect(dispatchedData).toEqual({ cardId: 100, saidUno: true });
  });

  test("UNO: NÃO envia saidUno: true ao jogar carta tendo 3 ou mais cartas na mão", () => {
    const manager = new BotManager();
    const card1 = makeCard(100, COLOR.RED, Type.NUMBERED, 5);
    const card2 = makeCard(101, COLOR.BLUE, Type.NUMBERED, 7);
    const card3 = makeCard(102, COLOR.GREEN, Type.NUMBERED, 2);
    const mockState = createMockState({
      players: [
        { id: 1, hand: [card1, card2, card3], isBot: true },
        { id: 2, hand: [makeCard(200, COLOR.BLUE, Type.NUMBERED, 2)], isBot: false },
      ],
      playerOrder: [1, 2],
      playerHandCounts: new Map([[1, 3], [2, 5]]),
      topDiscard: makeCard(99, COLOR.RED, Type.NUMBERED, 3),
    });

    let dispatchedEvent: string | undefined;
    let dispatchedData: any;
    manager.handleClientEvent = (name: string, data: any) => {
      dispatchedEvent = name;
      dispatchedData = data;
    };

    manager.onBotServerEvent(
      1,
      new TestServerEvent("PERMISSIONS", null, [], {
        playerId: 1,
        allowedEvents: [[], ["client:PLAY_CARD"]],
        allowedCards: [card1],
      }),
      mockState,
      {} as any,
    );

    expect(dispatchedEvent).toBe("client:PLAY_CARD");
    expect(dispatchedData).toEqual({ cardId: 100 });
  });

  test("UNO: agenda timer e despacha client:UNO ao receber PERMISSIONS contendo client:UNO", () => {
    vi.useFakeTimers();
    try {
      const manager = new BotManager(100, 200);
      const mockState = createMockState({
        players: [
          { id: 1, hand: [makeCard(100, COLOR.RED, Type.NUMBERED, 5)], isBot: false },
          { id: 2, hand: [makeCard(200, COLOR.BLUE, Type.NUMBERED, 7)], isBot: true },
        ],
        playerOrder: [1, 2],
        playerHandCounts: new Map([[1, 1], [2, 5]]),
      });

      let dispatchedEvent: string | undefined;
      let dispatchedData: any;
      let dispatchedBotId: number | undefined;
      manager.handleClientEvent = (name: string, data: any, botId: number) => {
        dispatchedEvent = name;
        dispatchedData = data;
        dispatchedBotId = botId;
      };

      manager.onBotServerEvent(
        2,
        new TestServerEvent("PERMISSIONS", null, [], {
          playerId: 1,
          allowedEvents: [[], ["client:UNO"], ["client:UNO"]],
          allowedCards: [],
        }),
        mockState,
        {} as any,
      );

      const bot = manager.getRegisteredBots().get(2);
      expect(bot?.actionTimer).toBeDefined();

      vi.advanceTimersByTime(250);

      expect(dispatchedEvent).toBe("client:UNO");
      expect(dispatchedData).toEqual({ playerId: 2 });
      expect(dispatchedBotId).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test("UNO: agenda timer e despacha client:UNO ao receber evento UNO", () => {
    vi.useFakeTimers();
    try {
      const manager = new BotManager(100, 200);
      const mockState = createMockState({
        players: [
          { id: 1, hand: [makeCard(100, COLOR.RED, Type.NUMBERED, 5)], isBot: false },
          { id: 2, hand: [makeCard(200, COLOR.BLUE, Type.NUMBERED, 7)], isBot: true },
        ],
        playerOrder: [1, 2],
      });

      let dispatchedEvent: string | undefined;
      let dispatchedData: any;
      manager.handleClientEvent = (name: string, data: any) => {
        dispatchedEvent = name;
        dispatchedData = data;
      };

      manager.onBotServerEvent(
        2,
        new TestServerEvent("UNO", null, [], {}),
        mockState,
        {} as any,
      );

      const bot = manager.getRegisteredBots().get(2);
      expect(bot?.actionTimer).toBeDefined();

      vi.advanceTimersByTime(250);

      expect(dispatchedEvent).toBe("client:UNO");
      expect(dispatchedData).toEqual({ playerId: 2 });
    } finally {
      vi.useRealTimers();
    }
  });

  test("UNO: cancela timer ao receber confirmação BROADCAST:client:UNO do servidor", () => {
    vi.useFakeTimers();
    try {
      const manager = new BotManager(100, 200);
      const mockState = createMockState({
        players: [
          { id: 1, hand: [makeCard(100, COLOR.RED, Type.NUMBERED, 5)], isBot: false },
          { id: 2, hand: [makeCard(200, COLOR.BLUE, Type.NUMBERED, 7)], isBot: true },
        ],
        playerOrder: [1, 2],
      });

      let dispatchedEvent: string | undefined;
      manager.handleClientEvent = (name: string) => {
        dispatchedEvent = name;
      };

      manager.onBotServerEvent(
        2,
        new TestServerEvent("PERMISSIONS", null, [], {
          playerId: 1,
          allowedEvents: [[], ["client:UNO"], ["client:UNO"]],
          allowedCards: [],
        }),
        mockState,
        {} as any,
      );

      const bot = manager.getRegisteredBots().get(2);
      expect(bot?.actionTimer).toBeDefined();

      // Servidor notifica que outro jogador disse UNO
      manager.onBotServerEvent(
        2,
        new TestServerEvent("BROADCAST:client:UNO", { id: 1 } as any, [], {
          playerId: 1,
        }),
        mockState,
        {} as any,
      );

      expect(bot?.actionTimer).toBeUndefined();

      vi.advanceTimersByTime(250);
      expect(dispatchedEvent).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  test("UNO: cancela timer ao receber novo evento PERMISSIONS sem client:UNO", () => {
    vi.useFakeTimers();
    try {
      const manager = new BotManager(100, 200);
      const mockState = createMockState({
        players: [
          { id: 1, hand: [makeCard(100, COLOR.RED, Type.NUMBERED, 5)], isBot: false },
          { id: 2, hand: [makeCard(200, COLOR.BLUE, Type.NUMBERED, 7)], isBot: true },
        ],
        playerOrder: [1, 2],
      });

      let dispatchedEvent: string | undefined;
      manager.handleClientEvent = (name: string) => {
        dispatchedEvent = name;
      };

      manager.onBotServerEvent(
        2,
        new TestServerEvent("PERMISSIONS", null, [], {
          playerId: 1,
          allowedEvents: [[], ["client:UNO"], ["client:UNO"]],
          allowedCards: [],
        }),
        mockState,
        {} as any,
      );

      const bot = manager.getRegisteredBots().get(2);
      expect(bot?.actionTimer).toBeDefined();

      // Servidor envia novo PERMISSIONS onde tempo de UNO expirou e rodada seguiu
      manager.onBotServerEvent(
        2,
        new TestServerEvent("PERMISSIONS", null, [], {
          playerId: 1,
          allowedEvents: [[], ["client:PLAY_CARD"], ["client:DRAW_CHOICE"]],
          allowedCards: [],
        }),
        mockState,
        {} as any,
      );

      expect(bot?.actionTimer).toBeUndefined();

      vi.advanceTimersByTime(250);
      expect(dispatchedEvent).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  describe("Tempo de resposta do envio de eventos (Delay de Jogada)", () => {
    test("calculateTurnDelay: respeita as faixas de timeout", () => {
      const manager = new BotManager();

      // Maior que 1000ms -> 1000ms
      expect(manager.calculateTurnDelay(5000)).toBe(DEFAULT_BOT_DELAY_MS);
      expect(manager.calculateTurnDelay(2000)).toBe(DEFAULT_BOT_DELAY_MS);
      expect(manager.calculateTurnDelay(1001)).toBe(DEFAULT_BOT_DELAY_MS);
      expect(manager.calculateTurnDelay(undefined)).toBe(DEFAULT_BOT_DELAY_MS);

      // Entre 20ms e 1000ms -> Math.floor(timeout / 2)
      expect(manager.calculateTurnDelay(1000)).toBe(500);
      expect(manager.calculateTurnDelay(500)).toBe(250);
      expect(manager.calculateTurnDelay(300)).toBe(150);
      expect(manager.calculateTurnDelay(40)).toBe(20);
      expect(manager.calculateTurnDelay(20)).toBe(10);

      // Menor que 20ms -> 0 (automático / imediato)
      expect(manager.calculateTurnDelay(19)).toBe(0);
      expect(manager.calculateTurnDelay(5)).toBe(0);
      expect(manager.calculateTurnDelay(0)).toBe(0);
    });

    test("com hasDelay: true e timeout > 1000ms, agenda timer de 1000ms antes de despachar evento", () => {
      vi.useFakeTimers();
      try {
        const manager = new BotManager();
        const card = makeCard(100, COLOR.RED, Type.NUMBERED, 5);
        const topCard = makeCard(99, COLOR.RED, Type.NUMBERED, 7);

        // Config com isTestRoom: false para ativar delay
        const mockState = createMockState({
          players: [
            { id: 1, hand: [card], isBot: true },
            { id: 2, hand: [makeCard(200, COLOR.BLUE, Type.NUMBERED, 7)], isBot: false },
          ],
          topDiscard: topCard,
          configs: { isTestRoom: false },
        });

        let dispatchedEvent: string | undefined;
        manager.handleClientEvent = (name: string) => {
          dispatchedEvent = name;
        };

        const bot = manager.getOrCreateBot(1, undefined, mockState);
        expect(bot.hasDelay).toBe(true);

        manager.onBotServerEvent(
          1,
          new TestServerEvent("PERMISSIONS", null, [], {
            playerId: 1,
            allowedEvents: [[], ["client:PLAY_CARD"]],
            allowedCards: [100],
            timeout: 5000,
          }),
          mockState,
          {} as any,
        );

        // Imediatamente não deve ter despachado ainda
        expect(dispatchedEvent).toBeUndefined();
        expect(bot.actionTimer).toBeDefined();

        // Avança 999ms: ainda não disparou
        vi.advanceTimersByTime(999);
        expect(dispatchedEvent).toBeUndefined();

        // Completa 1000ms: executa e despacha
        vi.advanceTimersByTime(1);
        expect(dispatchedEvent).toBe("client:PLAY_CARD");
        expect(bot.actionTimer).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    });

    test("com hasDelay: true e timeout curto (300ms), agenda metade do tempo (150ms)", () => {
      vi.useFakeTimers();
      try {
        const manager = new BotManager();
        const card = makeCard(100, COLOR.RED, Type.NUMBERED, 5);
        const topCard = makeCard(99, COLOR.RED, Type.NUMBERED, 7);

        const mockState = createMockState({
          players: [
            { id: 1, hand: [card], isBot: true },
            { id: 2, hand: [makeCard(200, COLOR.BLUE, Type.NUMBERED, 7)], isBot: false },
          ],
          topDiscard: topCard,
          configs: { isTestRoom: false },
        });

        let dispatchedEvent: string | undefined;
        manager.handleClientEvent = (name: string) => {
          dispatchedEvent = name;
        };

        const bot = manager.getOrCreateBot(1, undefined, mockState);
        expect(bot.hasDelay).toBe(true);

        manager.onBotServerEvent(
          1,
          new TestServerEvent("PERMISSIONS", null, [], {
            playerId: 1,
            allowedEvents: [[], ["client:PLAY_CARD"]],
            allowedCards: [100],
            timeout: 300,
          }),
          mockState,
          {} as any,
        );

        expect(dispatchedEvent).toBeUndefined();
        expect(bot.actionTimer).toBeDefined();

        // 149ms: ainda não disparou
        vi.advanceTimersByTime(149);
        expect(dispatchedEvent).toBeUndefined();

        // 150ms: dispara
        vi.advanceTimersByTime(1);
        expect(dispatchedEvent).toBe("client:PLAY_CARD");
        expect(bot.actionTimer).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    });

    test("com hasDelay: true e timeout < 20ms, executa imediatamente de forma síncrona", () => {
      const manager = new BotManager();
      const card = makeCard(100, COLOR.RED, Type.NUMBERED, 5);
      const topCard = makeCard(99, COLOR.RED, Type.NUMBERED, 7);

      const mockState = createMockState({
        players: [
          { id: 1, hand: [card], isBot: true },
          { id: 2, hand: [makeCard(200, COLOR.BLUE, Type.NUMBERED, 7)], isBot: false },
        ],
        topDiscard: topCard,
        configs: { isTestRoom: false },
      });

      let dispatchedEvent: string | undefined;
      manager.handleClientEvent = (name: string) => {
        dispatchedEvent = name;
      };

      manager.onBotServerEvent(
        1,
        new TestServerEvent("PERMISSIONS", null, [], {
          playerId: 1,
          allowedEvents: [[], ["client:PLAY_CARD"]],
          allowedCards: [100],
          timeout: 15,
        }),
        mockState,
        {} as any,
      );

      // Dispara imediatamente porque timeout < 20ms
      expect(dispatchedEvent).toBe("client:PLAY_CARD");
    });

    test("cancela timer pendente se novo evento PERMISSIONS chegar antes do disparo", () => {
      vi.useFakeTimers();
      try {
        const manager = new BotManager();
        const card = makeCard(100, COLOR.RED, Type.NUMBERED, 5);
        const topCard = makeCard(99, COLOR.RED, Type.NUMBERED, 7);

        const mockState = createMockState({
          players: [
            { id: 1, hand: [card], isBot: true },
            { id: 2, hand: [makeCard(200, COLOR.BLUE, Type.NUMBERED, 7)], isBot: false },
          ],
          topDiscard: topCard,
          configs: { isTestRoom: false },
        });

        let dispatchedCount = 0;
        manager.handleClientEvent = () => {
          dispatchedCount++;
        };

        const bot = manager.getOrCreateBot(1, undefined, mockState);

        // Primeiro evento de PERMISSIONS
        manager.onBotServerEvent(
          1,
          new TestServerEvent("PERMISSIONS", null, [], {
            playerId: 1,
            allowedEvents: [[], ["client:PLAY_CARD"]],
            allowedCards: [100],
            timeout: 5000,
          }),
          mockState,
          {} as any,
        );

        expect(bot.actionTimer).toBeDefined();

        // 200ms depois chega um novo PERMISSIONS cancelando o anterior (ex: timeout ou jumpin)
        vi.advanceTimersByTime(200);
        manager.onBotServerEvent(
          1,
          new TestServerEvent("PERMISSIONS", null, [], {
            playerId: 2,
            allowedEvents: [[], []],
            allowedCards: [],
          }),
          mockState,
          {} as any,
        );

        // O timer do bot 1 deve ter sido cancelado
        expect(bot.actionTimer).toBeUndefined();

        // Avança mais 500ms: nenhum evento deve ter sido despachado
        vi.advanceTimersByTime(500);
        expect(dispatchedCount).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    test("removeBot cancela actionTimer ativo para evitar jogadas fantasmas", () => {
      vi.useFakeTimers();
      try {
        const manager = new BotManager();
        const card = makeCard(100, COLOR.RED, Type.NUMBERED, 5);
        const topCard = makeCard(99, COLOR.RED, Type.NUMBERED, 7);

        const mockState = createMockState({
          players: [
            { id: 1, hand: [card], isBot: true },
            { id: 2, hand: [makeCard(200, COLOR.BLUE, Type.NUMBERED, 7)], isBot: false },
          ],
          topDiscard: topCard,
          configs: { isTestRoom: false },
        });

        let dispatchedEvent: string | undefined;
        manager.handleClientEvent = (name: string) => {
          dispatchedEvent = name;
        };

        const bot = manager.getOrCreateBot(1, undefined, mockState);

        manager.onBotServerEvent(
          1,
          new TestServerEvent("PERMISSIONS", null, [], {
            playerId: 1,
            allowedEvents: [[], ["client:PLAY_CARD"]],
            allowedCards: [100],
            timeout: 5000,
          }),
          mockState,
          {} as any,
        );

        expect(bot.actionTimer).toBeDefined();

        // Jogador humano reconecta e remove o bot
        manager.removeBot(1);

        vi.advanceTimersByTime(1200);
        expect(dispatchedEvent).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
