import { Card, COLOR, Type } from "../game-logic/shared/cards/default.card.ts";
import { SerializedCard } from "../game-logic/shared/events/server/game-started.event.ts";
import { DefaultState } from "../game-logic/shared/cards/default.card.ts";
import type { IBotAgent } from "./bot.types.ts";

export type { SerializedCard };

/**
 * Conta quantas cartas da mão do Bot são de cada cor.
 * Retorna um Map de COLOR -> contagem.
 */
export function countHandByColor(
  playerHand: Card[],
): Map<COLOR, number> {
  const counts = new Map<COLOR, number>();
  for (const card of playerHand) {
    if (!card || card.color === COLOR.WILD) continue;
    const color = card.color as COLOR;
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  return counts;
}

/**
 * Retorna a cor mais abundante na mão do Bot (excluindo WILD).
 * Em caso de empate, a cor que aparece primeiro no array é escolhida.
 */
export function getMostAbundantColor(playerHand: Card[]): COLOR {
  const counts = countHandByColor(playerHand);
  let bestColor: COLOR = COLOR.RED;
  let bestCount = -1;
  for (const [color, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestColor = color;
    }
  }
  return bestColor;
}

/**
 * Regra 3.1 — Valida se o Bot PODE jogar um DRAW_4.
 * Bot só pode considerar +4 se não tiver nenhuma carta válida da cor atual.
 */
export function canPlayDraw4Legally(
  bot: IBotAgent,
  state: DefaultState,
  activeColor: COLOR,
): boolean {
  const player = state.room.players.find((p) => p.id === bot.playerId);
  if (!player) return true;
  for (const card of player.hand) {
    if (card.color === activeColor && card.type !== Type.DRAW_4) {
      return false; // Tem carta da cor, não pode jogar +4
    }
  }
  return true;
}

/**
 * Retorna os jogadores na ordem relativa ao Bot (P+1, P+2, P+3...).
 */
export function getRelativePlayers(botId: number, state: DefaultState): number[] {
  const order = state.room.players.map((p) => p.id);
  if (order.length === 0) return [];
  const myIndex = order.indexOf(botId);
  if (myIndex === -1) return [];

  const relative: number[] = [];
  for (let i = 1; i < order.length; i++) {
    const idx = (myIndex + i) % order.length;
    relative.push(order[idx]);
  }
  return relative;
}

/**
 * Regra 3.2 — Análise de ameaças: encontra jogadores com poucas cartas (< 4).
 * Retorna os IDs dos jogadores ameaçadores na ordem relativa ao bot.
 */
export function findThreateningPlayers(
  bot: IBotAgent,
  state: DefaultState,
): {
  second: number | undefined;
  third: number | undefined;
  fourth: number | undefined;
} {
  const relatives = getRelativePlayers(bot.playerId, state);
  const THREAT_THRESHOLD = 4;
  const playerHandCounts = new Map<number, number>();
  for (const p of state.room.players) {
    playerHandCounts.set(p.id, p.hand.length);
  }

  const pNext = relatives[0];
  const pSecond = relatives[1];
  const pThird = relatives[2];

  const isThreat = (p: number | undefined) => {
    if (p === undefined) return false;
    const count = playerHandCounts.get(p) ?? 99;
    return count > 0 && count < THREAT_THRESHOLD;
  };

  return {
    second: isThreat(pNext) ? pNext : undefined,
    third: isThreat(pSecond) ? pSecond : undefined,
    fourth: isThreat(pThird) ? pThird : undefined,
  };
}

/**
 * Escolhe a melhor carta para jogar dado o contexto de ameaças (Seção 3.2 bot-rules.md).
 * Retorna o cardId da carta escolhida, ou undefined se não encontrar.
 */
export function chooseBestCard(
  bot: IBotAgent,
  state: DefaultState,
  threats: ReturnType<typeof findThreateningPlayers>,
): number | undefined {
  const { allowedCardIds } = bot;
  if (allowedCardIds.length === 0) return undefined;

  const player = state.room.players.find((p) => p.id === bot.playerId);
  const playerHand = player?.hand ?? [];
  const wholeDeck = state.room.deck.wholeDeck ?? [];
  const topDiscard = state.room.deck.topDiscard;

  const cardInfo = (id: number) => wholeDeck.find((c) => c.id === id);
  const activeColor = (topDiscard?.color as COLOR) ?? COLOR.RED;

  // Busca auxiliar de carta por tipo na mão do bot que esteja nas permitidas
  const findAllowed = (pred: (c: Card) => boolean) =>
    allowedCardIds
      .map((id) => cardInfo(id))
      .filter((c): c is Card => c !== undefined && pred(c));

  // ========== REGRA 3.2.1: Ameaça P+1 (segundo jogador na ordem) ==========
  if (threats.second !== undefined) {
    const nextMem = bot.memory.getOrCreatePlayerMemory(threats.second);
    const unmatchedColors = nextMem.unmatchedColors;

    // Prioridade 1: cartas de bloqueio/compra
    const blocking = findAllowed(
      (c) =>
        c.type === Type.BLOCK ||
        c.type === Type.REVERSE ||
        c.type === Type.DRAW_2 ||
        c.type === Type.DRAW_4,
    );

    if (blocking.length > 0) {
      // Prefere +4 na cor que P+1 não tem, se for válido
      const draw4 = blocking.find((c) => c.type === Type.DRAW_4);
      if (draw4 && canPlayDraw4Legally(bot, state, activeColor)) {
        return draw4.id;
      }
      // Usa +2 ou BLOCK ou REVERSE (da cor que P+1 não tem, se possível)
      const colorTargeted = blocking.find(
        (c) => c.color !== COLOR.WILD && unmatchedColors.has(c.color as COLOR),
      );
      if (colorTargeted) return colorTargeted.id;
      // Qualquer carta de bloqueio
      return blocking[0].id;
    }
  }

  // ========== REGRA 3.2.2: Ameaça P+2 (terceiro jogador na ordem) ==========
  if (threats.third !== undefined) {
    const secondMem = bot.memory.getOrCreatePlayerMemory(threats.third);
    const unmatchedColors = secondMem.unmatchedColors;

    // Tenta +4 na cor que P+2 não tem
    const draw4 = findAllowed((c) => c.type === Type.DRAW_4);
    if (draw4.length > 0 && canPlayDraw4Legally(bot, state, activeColor)) {
      return draw4[draw4.length - 1].id; // mais à direita
    }

    // Tenta +2 da cor que P+2 não tem
    const draw2Targeted = findAllowed(
      (c) => c.type === Type.DRAW_2 && unmatchedColors.has(c.color as COLOR),
    );
    if (draw2Targeted.length > 0) return draw2Targeted[0].id;

    // Qualquer +2
    const draw2 = findAllowed((c) => c.type === Type.DRAW_2);
    if (draw2.length > 0) return draw2[0].id;
  }

  // ========== REGRA 3.2.3: Ameaça P+3 (quarto — jogador logo antes do Bot) ==========
  if (threats.fourth !== undefined) {
    const thirdMem = bot.memory.getOrCreatePlayerMemory(threats.fourth);
    const unmatchedColors = thirdMem.unmatchedColors;

    if (unmatchedColors.size > 0) {
      const drawTargeted = findAllowed(
        (c) =>
          (c.type === Type.DRAW_2 || c.type === Type.DRAW_4) &&
          unmatchedColors.has(c.color as COLOR),
      );
      if (drawTargeted.length > 0) return drawTargeted[0].id;
    }

    if (unmatchedColors.size > 0) {
      const colorTargeted = findAllowed(
        (c) => c.color !== COLOR.WILD && unmatchedColors.has(c.color as COLOR),
      );
      if (colorTargeted.length > 0) return colorTargeted[colorTargeted.length - 1].id;
    }
  }

  // ========== REGRA 3.2.4: Modo padrão (sem ameaças) ==========
  const mostAbundantColor = getMostAbundantColor(playerHand);
  const nonDrawCards = findAllowed(
    (c) =>
      c.color === mostAbundantColor &&
      c.type !== Type.DRAW_2 &&
      c.type !== Type.DRAW_4,
  );

  if (nonDrawCards.length > 0) {
    return nonDrawCards[nonDrawCards.length - 1].id;
  }

  const anyAbundant = findAllowed((c) => c.color === mostAbundantColor);
  if (anyAbundant.length > 0) return anyAbundant[anyAbundant.length - 1].id;

  return allowedCardIds[allowedCardIds.length - 1];
}

/**
 * Regra 3.0 — Escolhe a cor ao jogar Coringa / +4.
 * Sem ameaça: cor mais abundante na mão. Com ameaça P+1: cor em unmatchedColors de P+1.
 */
export function chooseWildColor(
  bot: IBotAgent,
  state: DefaultState,
  threats: ReturnType<typeof findThreateningPlayers>,
): COLOR {
  if (threats.second !== undefined) {
    const nextMem = bot.memory.getOrCreatePlayerMemory(threats.second);
    if (nextMem.unmatchedColors.size > 0) {
      return nextMem.unmatchedColors.values().next().value as COLOR;
    }
  }
  if (threats.third !== undefined) {
    const secondMem = bot.memory.getOrCreatePlayerMemory(threats.third);
    if (secondMem.unmatchedColors.size > 0) {
      return secondMem.unmatchedColors.values().next().value as COLOR;
    }
  }

  const player = state.room.players.find((p) => p.id === bot.playerId);
  return getMostAbundantColor(player?.hand ?? []);
}

/**
 * Regra 4 — Lógica de decisão de desafio ao +4.
 * Retorna true se o bot deve desafiar.
 */
export function shouldChallengeDraw4(
  bot: IBotAgent,
  state: DefaultState,
  lastActivePlayerId: number | undefined,
  previousActiveColor: COLOR | undefined,
): boolean {
  if (lastActivePlayerId === undefined || !previousActiveColor) return false;

  const opponentMem = bot.memory.getOrCreatePlayerMemory(lastActivePlayerId);
  const opponentPlayer = state.room.players.find((p) => p.id === lastActivePlayerId);
  const opponentHandCount = opponentPlayer ? opponentPlayer.hand.length : 99;
  const wholeDeck = state.room.deck.wholeDeck ?? [];

  const knownCards = Array.from(opponentMem.knownCardIds);
  const knownHadPrevColor = knownCards.some((id) => {
    const card = wholeDeck.find((c) => c.id === id);
    return card && card.color === previousActiveColor;
  });
  if (knownHadPrevColor) return true;

  if (opponentMem.unmatchedColors.has(previousActiveColor)) return false;

  const playedCount = opponentMem.playedColorCounts.get(previousActiveColor) ?? 0;
  if (playedCount >= 3) return false;

  if (opponentHandCount < 4 && opponentMem.unmatchedColors.size === 0) return true;

  return false;
}

export function findJumpInCard(
  bot: IBotAgent,
  state: DefaultState,
): Card | undefined {
  const player = state.room.players.find((p) => p.id === bot.playerId);
  if (!player || !state.room.deck.topDiscard) return undefined;

  const discarded = state.room.deck.topDiscard;

  for (const card of player.hand) {
    if (
      card.color === discarded.color &&
      card.type === discarded.type &&
      card.value === discarded.value
    ) {
      return card;
    }
  }
  return undefined;
}

/**
 * Regra 3.2.1 (compra forçada) — Avalia se o Bot deve comprar uma carta em vez de jogar.
 */
export function shouldDrawInstead(
  bot: IBotAgent,
  state: DefaultState,
  threats: ReturnType<typeof findThreateningPlayers>,
  allowedCardIds: number[],
): boolean {
  if (threats.second === undefined) return false;
  if (allowedCardIds.length === 0) return false;

  // Se o baralho e a pilha de descarte estiverem sem cartas, não é possível comprar
  const totalAvailableToDraw =
    (state.room?.deck?.deck?.length ?? 0) +
    (state.room?.deck?.discardPile?.length ?? 0);
  if (
    state.room?.deck?.deck !== undefined &&
    state.room?.deck?.discardPile !== undefined &&
    totalAvailableToDraw === 0
  ) {
    return false;
  }

  const nextMem = bot.memory.getOrCreatePlayerMemory(threats.second);
  const unmatchedColors = nextMem.unmatchedColors;
  const topDiscard = state.room.deck.topDiscard;
  const activeColor = (topDiscard?.color as COLOR) ?? COLOR.RED;
  const wholeDeck = state.room.deck.wholeDeck ?? [];

  const isBlockingCard = (c: Card) =>
    c.type === Type.BLOCK ||
    c.type === Type.REVERSE ||
    c.type === Type.DRAW_2 ||
    c.type === Type.DRAW_4;

  const isColorUnmatched = (c: Card) =>
    c.color !== COLOR.WILD && unmatchedColors.has(c.color as COLOR);

  for (const id of allowedCardIds) {
    const card = wholeDeck.find((c) => c.id === id);
    if (!card) continue;

    if (card.type === Type.DRAW_4 && canPlayDraw4Legally(bot, state, activeColor)) {
      return false;
    }

    if (isBlockingCard(card) || isColorUnmatched(card)) {
      return false;
    }
  }

  return true;
}

/**
 * Regra 5.1 — Avalia se o Jump-In com a carta `jumpCard` é estrategicamente vantajoso.
 */
export function isJumpInWorthIt(
  bot: IBotAgent,
  jumpCard: Card | SerializedCard,
  threats: ReturnType<typeof findThreateningPlayers>,
): boolean {
  if (threats.second === undefined) return true;

  const nextMem = bot.memory.getOrCreatePlayerMemory(threats.second);
  const unmatchedColors = nextMem.unmatchedColors;

  if (
    jumpCard.type === Type.BLOCK ||
    jumpCard.type === Type.REVERSE ||
    jumpCard.type === Type.DRAW_2 ||
    jumpCard.type === Type.DRAW_4
  ) {
    return true;
  }

  if (unmatchedColors.size > 0 && unmatchedColors.has(jumpCard.color as COLOR)) {
    return true;
  }

  return false;
}

/**
 * Regra 6 — Decide se o Bot deve jogar a carta que acabou de comprar.
 */
export function shouldPlayDrawnCard(
  bot: IBotAgent,
  state: DefaultState,
  drawnCard: SerializedCard,
  threats: ReturnType<typeof findThreateningPlayers>,
): boolean {
  const topDiscard = state.room.deck.topDiscard;
  const activeColor = (topDiscard?.color as COLOR) ?? COLOR.RED;

  const matchesDiscard =
    drawnCard.color === activeColor ||
    drawnCard.color === COLOR.WILD ||
    (topDiscard &&
      drawnCard.type === topDiscard.type &&
      drawnCard.value !== undefined &&
      drawnCard.value === topDiscard.value);

  if (threats.second === undefined && threats.third === undefined && threats.fourth === undefined) {
    return !!matchesDiscard;
  }

  if (threats.second !== undefined) {
    const nextMem = bot.memory.getOrCreatePlayerMemory(threats.second);
    const unmatchedColors = nextMem.unmatchedColors;

    const blocks = drawnCard.type === Type.BLOCK ||
      drawnCard.type === Type.REVERSE ||
      drawnCard.type === Type.DRAW_2 ||
      drawnCard.type === Type.DRAW_4;

    const isUnmatchedColor = drawnCard.color !== COLOR.WILD &&
      unmatchedColors.has(drawnCard.color as COLOR);

    const isDraw4Valid = drawnCard.type === Type.DRAW_4 &&
      canPlayDraw4Legally(bot, state, activeColor);

    if (isDraw4Valid || blocks || isUnmatchedColor) return true;

    return false;
  }

  const isDrawCard = drawnCard.type === Type.DRAW_2 || drawnCard.type === Type.DRAW_4;
  if (isDrawCard) return true;

  return !!matchesDiscard;
}

