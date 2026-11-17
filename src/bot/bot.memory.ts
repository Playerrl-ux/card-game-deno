import { COLOR } from "../game-logic/shared/cards/default.card.ts";

export interface PlayerMemory {
  playerId: number;
  /** IDs de cartas que o Bot sabe com 100% de certeza que o jogador possui */
  knownCardIds: Set<number>;
  /** Cores que o jogador provavelmente NÃO possui (comprou opcionalmente no turno dessa cor) */
  unmatchedColors: Set<COLOR>;
  /** Quantidade de cartas jogadas de cada cor desde a última compra */
  playedColorCounts: Map<COLOR, number>;
}

export class BotMemory {
  private players: Map<number, PlayerMemory> = new Map();

  getOrCreatePlayerMemory(playerId: number): PlayerMemory {
    let memory = this.players.get(playerId);
    if (!memory) {
      memory = {
        playerId,
        knownCardIds: new Set(),
        unmatchedColors: new Set(),
        playedColorCounts: new Map(),
      };
      this.players.set(playerId, memory);
    }
    return memory;
  }

  recordCardPlayed(playerId: number, cardId?: number, color?: COLOR): void {
    const memory = this.getOrCreatePlayerMemory(playerId);
    if (cardId !== undefined) {
      memory.knownCardIds.delete(cardId);
    }
    if (color) {
      const current = memory.playedColorCounts.get(color) || 0;
      memory.playedColorCounts.set(color, current + 1);
    }
  }

  recordOptionalDraw(playerId: number, activeColor: COLOR): void {
    const memory = this.getOrCreatePlayerMemory(playerId);
    memory.unmatchedColors.add(activeColor);
  }

  recordForcedDraw(playerId: number): void {
    const memory = this.getOrCreatePlayerMemory(playerId);
    // Limpa cores não correspondidas porque novas cartas foram compradas
    memory.unmatchedColors.clear();
  }

  resetUnmatchedColors(playerId: number): void {
    this.recordForcedDraw(playerId);
  }

  recordKnownCards(playerId: number, cardIds: number[]): void {
    const memory = this.getOrCreatePlayerMemory(playerId);
    for (const id of cardIds) {
      memory.knownCardIds.add(id);
    }
  }

  swapPlayerMemories(player1Id: number, player2Id: number): void {
    const mem1 = this.players.get(player1Id);
    const mem2 = this.players.get(player2Id);
    if (mem1 && mem2) {
      const tempKnown = new Set(mem1.knownCardIds);
      const tempUnmatched = new Set(mem1.unmatchedColors);

      mem1.knownCardIds = new Set(mem2.knownCardIds);
      mem1.unmatchedColors = new Set(mem2.unmatchedColors);

      mem2.knownCardIds = tempKnown;
      mem2.unmatchedColors = tempUnmatched;
    }
  }
}
