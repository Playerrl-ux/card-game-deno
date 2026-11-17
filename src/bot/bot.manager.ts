import { EventManager } from "../game-logic/base/event.manager.ts";
import { PlayerSocket } from "../game-logic/base/player/player.state.ts";
import { ServerEventArgs } from "../game-logic/base/server.event.ts";
import {
  COLOR,
  DefaultState,
} from "../game-logic/shared/cards/default.card.ts";
import {
  SerializedCard,
  ServerPayload,
} from "../game-logic/shared/events/server/server-payloads.ts";
import { DefaultRandomManager } from "../game-logic/shared/utils/random.manager.ts";
import {
  chooseBestCard,
  chooseWildColor,
  findJumpInCard,
  findThreateningPlayers,
  isJumpInWorthIt,
  shouldChallengeDraw4,
  shouldDrawInstead,
  shouldPlayDrawnCard,
} from "./bot.decision.ts";
import { BotMemory } from "./bot.memory.ts";
import { IBotAgent, IBotManager } from "./bot.types.ts";
export const DEFAULT_BOT_DELAY_MS = 1000;
export const MIN_BOT_DELAY_THRESHOLD_MS = 20;

export class BotManager implements IBotManager {
  public handleClientEvent?: (
    eventName: string,
    data: unknown,
    botId: number,
  ) => void;

  /** Mapa de bots registrados para acompanhamento de contexto (botId -> IBotAgent) */
  private bots: Map<number, IBotAgent> = new Map();

  /** ID do último jogador ativo antes de um +4 ser jogado (para desafio) */
  private lastActivePlayerId?: number;
  /** Cor ativa antes do +4 ser jogado (para desafio) */
  private previousActiveColor?: COLOR;

  constructor(
    private readonly minTimeout: number = 400,
    private readonly maxTimeout: number = 1200,
  ) {}

  /**
   * Retorna os bots registrados atualmente no BotManager.
   */
  public getRegisteredBots(): Map<number, IBotAgent> {
    return this.bots;
  }

  /**
   * Registra o socket do bot, define o callback onBotServerEvent e cria o contexto IBotAgent.
   */
  public registerBotSocket(
    botId: number,
    socket: PlayerSocket,
    state: DefaultState,
    eventManager: EventManager<DefaultState>,
    seed?: number,
  ): IBotAgent {
    let bot = this.bots.get(botId);
    if (!bot) {
      bot = {
        playerId: botId,
        minTimeout: this.minTimeout,
        maxTimeout: this.maxTimeout,
        hasDelay: state.configs?.isTestRoom ? false : true,
        memory: new BotMemory(),
        allowedEvents: [],
        allowedCardIds: [],
        rngState: { seed: DefaultRandomManager.initSeed(seed) },
      };
      this.bots.set(botId, bot);
    }

    return bot;
  }

  /**
   * Registra/Cria o contexto do bot se ainda não existir (auxiliar para testes/back-compat).
   */
  public getOrCreateBot(
    botId: number,
    seed?: number,
    state?: DefaultState,
  ): IBotAgent {
    let bot = this.bots.get(botId);
    if (!bot) {
      bot = {
        playerId: botId,
        minTimeout: this.minTimeout,
        maxTimeout: this.maxTimeout,
        hasDelay: state?.configs?.isTestRoom ? false : true,
        memory: new BotMemory(),
        allowedEvents: [],
        allowedCardIds: [],
        rngState: { seed: DefaultRandomManager.initSeed(seed) },
      };
      this.bots.set(botId, bot);
    } else if (state?.configs?.isTestRoom) {
      bot.hasDelay = false;
    }
    return bot;
  }

  /**
   * Invalida e remove o bot quando o jogador humano reconecta.
   * Cancela qualquer timer pendente do bot.
   */
  public removeBot(botId: number): void {
    const bot = this.bots.get(botId);
    if (bot) {
      this.cancelActionTimer(bot);
      this.bots.delete(botId);
    }
  }

  /**
   * Calcula o delay para o bot enviar seu evento com base no timeout disponível:
   * - Se o timeout for maior que 1000ms: usa DEFAULT_BOT_DELAY_MS (1000ms).
   * - Se for um timeout curto (entre 20ms e 1000ms): usa Math.floor(availableTimeout / 2).
   * - Se for menor que 20ms: retorna 0 (execução imediata).
   */
  public calculateTurnDelay(availableTimeout?: number): number {
    if (
      availableTimeout === undefined ||
      availableTimeout > DEFAULT_BOT_DELAY_MS
    ) {
      return DEFAULT_BOT_DELAY_MS;
    }
    if (availableTimeout >= MIN_BOT_DELAY_THRESHOLD_MS) {
      return Math.floor(availableTimeout / 2);
    }
    return 0;
  }

  /**
   * Método de callback invocado individualmente por sendToPlayer para o socket deste bot específico.
   */
  public onBotServerEvent(
    botId: number,
    event: ServerEventArgs<unknown>,
    state: DefaultState,
    eventManager: EventManager<DefaultState>,
  ): void {
    const bot = this.getOrCreateBot(botId, undefined, state);
    if (!event || !event.name) return;

    // Se for uma test_room, a flag do delay dos bots deve ser falsa
    if (state?.configs?.isTestRoom) {
      bot.hasDelay = false;
    }

    // 1. Atualizar memória interna deste bot específico
    this.updateBotMemoryFromEvent(bot, event, state);

    // 2. Tratar eventos específicos de tomada de decisão do turno
    if (event.name === "PERMISSIONS") {
      const payload = event.data as {
        allowedEvents: string[][];
        allowedCards: any[];
        playerId: number;
        timeout?: number;
      };
      const allowed = payload?.allowedEvents?.[botId] || [];

      // Cancela qualquer timer de ação pendente ao receber um novo PERMISSIONS
      this.cancelActionTimer(bot);

      // Se o novo evento de permissões permitir JUMP_IN para este bot e não for o turno dele:
      if (allowed.includes("client:JUMP_IN") && payload.playerId !== botId) {
        this.evaluateJumpInBot(bot, payload.playerId, state);
      }

      // Se o novo evento de permissões permitir UNO para este bot:
      if (allowed.includes("client:UNO")) {
        this.evaluateUnoBot(bot, state);
      }

      if (payload && payload.playerId === botId) {
        bot.allowedEvents = allowed;
        bot.allowedCardIds = (payload.allowedCards || []).map((c) =>
          typeof c === "object" && c !== null ? c.id : c,
        );

        if (bot.allowedEvents.length > 0) {
          if (!bot.hasDelay) {
            this.executeDecision(bot, state, eventManager);
          } else {
            const delay = this.calculateTurnDelay(payload.timeout);
            if (delay < MIN_BOT_DELAY_THRESHOLD_MS) {
              this.executeDecision(bot, state, eventManager);
            } else {
              const timer = setTimeout(() => {
                bot.actionTimer = undefined;
                this.executeDecision(bot, state, eventManager);
              }, delay);
              bot.actionTimer = timer;
            }
          }
        }
      }
    }

    const eventNameUpper = (event.name || "").toUpperCase();
    if (
      eventNameUpper === "UNO" ||
      (eventNameUpper === "CLIENT:UNO" &&
        !event.name.toUpperCase().startsWith("BROADCAST"))
    ) {
      this.evaluateUnoBot(bot, state);
    }
  }

  /**
   * Executa a decisão lógica do Bot no seu turno lendo o estado global diretamente.
   */
  public executeDecision(
    bot: IBotAgent,
    state: DefaultState,
    eventManager: EventManager<DefaultState>,
  ): void {
    const threats = findThreateningPlayers(bot, state);

    // 1. Escolher cor se solicitado (client:CHOOSE_COLOR)
    if (bot.allowedEvents.includes("client:CHOOSE_COLOR")) {
      const color = chooseWildColor(bot, state, threats);
      this.handleClientEvent?.("client:CHOOSE_COLOR", { color }, bot.playerId);
      return;
    }

    // 2. Escolha de desafio ao +4 (client:CHALLENGE)
    if (bot.allowedEvents.includes("client:CHALLENGE")) {
      const challenge = shouldChallengeDraw4(
        bot,
        state,
        this.lastActivePlayerId,
        this.previousActiveColor,
      );
      if (challenge) {
        this.handleClientEvent?.(
          "client:CHALLENGE",
          { challenge: true },
          bot.playerId,
        );
        return;
      }
    }

    // 3. Escolher alvo da Carta 7 (client:SELECT_HAND)
    if (bot.allowedEvents.includes("client:SELECT_HAND")) {
      const targetPlayerId = this.pickHandSwapTarget(bot, state);
      this.handleClientEvent?.(
        "client:SELECT_HAND",
        { targetId: targetPlayerId },
        bot.playerId,
      );
      return;
    }

    // 4. Decisão pós-compra (client:KEEP_EVENT)
    if (bot.allowedEvents.includes("client:KEEP_EVENT")) {
      let cardToPlay = bot.lastDrawnCard;

      // Se lastDrawnCard não estiver definida ou não puder ser jogada segundo allowedCardIds,
      // seleciona a última carta comprada permitida pelo servidor
      if (
        bot.allowedCardIds.length > 0 &&
        (!cardToPlay || !bot.allowedCardIds.includes(cardToPlay.id))
      ) {
        const wholeDeck = state.room.deck.wholeDeck ?? [];
        const lastAllowedId = bot.allowedCardIds[bot.allowedCardIds.length - 1];
        const allowedCard = wholeDeck.find((c) => c.id === lastAllowedId);
        if (allowedCard) {
          cardToPlay = allowedCard as SerializedCard;
        }
      }

      if (
        cardToPlay &&
        (bot.allowedCardIds.length === 0 ||
          bot.allowedCardIds.includes(cardToPlay.id)) &&
        shouldPlayDrawnCard(bot, state, cardToPlay, threats) &&
        bot.allowedEvents.includes("client:PLAY_CARD")
      ) {
        const player = state.room.players.find((p) => p.id === bot.playerId);
        const saidUno = player?.hand.length === 2;
        this.handleClientEvent?.(
          "client:PLAY_CARD",
          { cardId: cardToPlay.id, ...(saidUno ? { saidUno: true } : {}) },
          bot.playerId,
        );
      } else {
        this.handleClientEvent?.("client:KEEP_EVENT", {}, bot.playerId);
      }
      bot.lastDrawnCard = undefined;
      return;
    }

    // 5. Jogada regular do turno (client:PLAY_CARD)
    if (bot.allowedEvents.includes("client:PLAY_CARD")) {
      if (
        bot.allowedEvents.includes("client:DRAW_CHOICE") &&
        shouldDrawInstead(bot, state, threats, bot.allowedCardIds)
      ) {
        this.handleClientEvent?.("client:DRAW_CHOICE", {}, bot.playerId);
        return;
      }

      const cardId = chooseBestCard(bot, state, threats);
      if (cardId !== undefined) {
        const player = state.room.players.find((p) => p.id === bot.playerId);
        const saidUno = player?.hand.length === 2;
        this.handleClientEvent?.(
          "client:PLAY_CARD",
          { cardId, ...(saidUno ? { saidUno: true } : {}) },
          bot.playerId,
        );
        return;
      }
    }

    // 6. Fallback de compra se não pôde/quis jogar (client:DRAW_CHOICE)
    if (bot.allowedEvents.includes("client:DRAW_CHOICE")) {
      this.handleClientEvent?.("client:DRAW_CHOICE", {}, bot.playerId);
      return;
    }
  }

  /**
   * Atualiza a memória de deduções do bot individual com base nos eventos de jogo recebidos por ele
   */
  private updateBotMemoryFromEvent(
    bot: IBotAgent,
    event: ServerEventArgs<unknown>,
    state: DefaultState,
  ): void {
    const eventNameUpper = event.name.toUpperCase();

    if (event.name === "CARD_DRAW") {
      const payload = event.data as ServerPayload<"CARD_DRAW">;
      if (payload) {
        if (payload.quantity > 1 && bot.playerId !== payload.playerId) {
          bot.memory.resetUnmatchedColors(payload.playerId);
        }

        if (
          bot.playerId === payload.playerId &&
          payload.cards &&
          payload.cards.length > 0
        ) {
          // Seleciona a última carta comprada que pode ser jogada (ou a última comprada)
          const playableDrawnCard = [...payload.cards].reverse().find((c) => {
            if (!c || c.id === undefined) return false;
            const top = state.room.deck.topDiscard;
            if (!top) return true;
            const wholeDeck = state.room.deck.wholeDeck ?? [];
            const fullCard = wholeDeck.find((wc) => wc.id === c.id);
            if (fullCard && typeof fullCard.canBePutOver === "function") {
              return fullCard.canBePutOver(fullCard, top, state);
            }
            return (
              c.color === "WILD" ||
              c.color === top.color ||
              (c.type === top.type &&
                c.value !== undefined &&
                c.value === top.value)
            );
          }) as SerializedCard | undefined;

          const card =
            playableDrawnCard ??
            (payload.cards[payload.cards.length - 1] as SerializedCard);

          if (card && card.id !== undefined) {
            bot.lastDrawnCard = card;
          }
        }
      }
    }

    if (
      eventNameUpper === "CLIENT:PLAY_CARD" ||
      eventNameUpper === "BROADCAST:CLIENT:PLAY_CARD"
    ) {
      const payload = event.data as {
        cardName?: string;
        card?: SerializedCard;
      };
      const playerId = event.sendedBy?.id ?? -1;
      if (payload && playerId >= 0) {
        this.lastActivePlayerId = playerId;
        const activeColor = state.room.deck.topDiscard?.color;
        if (activeColor && activeColor !== "WILD") {
          this.previousActiveColor = activeColor as COLOR;
        }

        if (bot.playerId !== playerId && activeColor) {
          const playedCardId = state.room.deck.topDiscard?.id;
          bot.memory.recordCardPlayed(
            playerId,
            playedCardId,
            activeColor as COLOR,
          );
        }
        this.cancelActionTimer(bot);

        // Avalia Jump-In para este bot individual
        if (bot.playerId !== playerId) {
          this.evaluateJumpInBot(bot, playerId, state);
        }
      }
    }

    // Confirmação de Jump-In recebida do servidor
    if (
      eventNameUpper === "CLIENT:JUMP_IN" ||
      eventNameUpper === "BROADCAST:CLIENT:JUMP_IN"
    ) {
      this.cancelAllActionTimers();

      const payload = event.data as {
        target?: SerializedCard;
        cardJumpedIn?: SerializedCard;
      };
      const playerId = event.sendedBy?.id ?? -1;
      if (payload && playerId >= 0 && payload.cardJumpedIn) {
        this.lastActivePlayerId = playerId;
        const color = payload.cardJumpedIn.color;
        if (color && color !== "WILD") {
          this.previousActiveColor = color as COLOR;
        }
        if (bot.playerId !== playerId && color) {
          bot.memory.recordCardPlayed(
            playerId,
            payload.cardJumpedIn.id,
            color as COLOR,
          );
        }
      }
    }

    // Confirmação de UNO recebida do servidor (alguém já disse UNO)
    if (
      eventNameUpper === "CLIENT:UNO" ||
      eventNameUpper === "BROADCAST:CLIENT:UNO" ||
      eventNameUpper === "BROADCAST:UNO"
    ) {
      this.cancelAllActionTimers();
    }

    if (eventNameUpper === "WIN" || eventNameUpper === "BROADCAST:WIN") {
      this.cancelActionTimer(bot);
    }
  }

  /**
   * Avalia a jogada de UNO para um bot individual
   */
  private evaluateUnoBot(bot: IBotAgent, state: DefaultState): void {
    this.cancelActionTimer(bot);

    const rangeMs = Math.max(0, bot.maxTimeout - bot.minTimeout);
    const reactionTime =
      bot.minTimeout +
      Math.floor(DefaultRandomManager.next(bot.rngState) * rangeMs);

    const timer = setTimeout(() => {
      bot.actionTimer = undefined;

      this.handleClientEvent?.(
        "client:UNO",
        { playerId: bot.playerId },
        bot.playerId,
      );
    }, reactionTime);

    bot.actionTimer = timer;
  }

  /**
   * Avalia a jogada de Jump-In para um bot individual
   */
  private evaluateJumpInBot(
    bot: IBotAgent,
    actorPlayerId: number,
    state: DefaultState,
  ): void {
    if (!state.configs?.JUMPIN) return;
    if (!state.room.deck.topDiscard) return;

    const jumpCard = findJumpInCard(bot, state);
    if (!jumpCard) return;

    const threats = findThreateningPlayers(bot, state);
    if (!isJumpInWorthIt(bot, jumpCard, threats)) return;

    this.cancelActionTimer(bot);

    const targetId = state.room.deck.topDiscard.id;
    const rangeMs = Math.max(0, bot.maxTimeout - bot.minTimeout);
    const reactionTime =
      bot.minTimeout +
      Math.floor(DefaultRandomManager.next(bot.rngState) * rangeMs);

    const timer = setTimeout(() => {
      bot.actionTimer = undefined;

      const currentTop = state.room.deck.topDiscard;
      const player = state.room.players.find((p) => p.id === bot.playerId);
      const hasCard = player?.hand.some((c) => c.id === jumpCard.id);

      if (currentTop && currentTop.id === targetId && hasCard) {
        this.handleClientEvent?.(
          "client:JUMP_IN",
          { cardJumpedId: jumpCard.id, targetId },
          bot.playerId,
        );
      }
    }, reactionTime);

    bot.actionTimer = timer;
  }

  private pickHandSwapTarget(bot: IBotAgent, state: DefaultState): number {
    const threats = findThreateningPlayers(bot, state);
    const playerOrder = state.room.players.map((p) => p.id);
    let bestTargetId = playerOrder.find((id) => id !== bot.playerId) ?? 0;
    let maxCards = -1;

    for (const player of state.room.players) {
      if (player.id === bot.playerId) continue;
      const count = player.hand.length;
      if (count > maxCards) {
        maxCards = count;
        bestTargetId = player.id;
      }
    }

    if (threats.second !== undefined) {
      bestTargetId = threats.second;
    }

    return bestTargetId;
  }

  public cancelActionTimer(bot: IBotAgent): void {
    if (bot.actionTimer) {
      clearTimeout(bot.actionTimer);
      bot.actionTimer = undefined;
    }
  }

  public cancelAllActionTimers(): void {
    for (const bot of this.bots.values()) {
      this.cancelActionTimer(bot);
    }
  }
}
