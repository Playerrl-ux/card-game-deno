import { EventEmitter } from "node:events";
import { ActionSignature } from "../../base/client.event.ts";
import {
  ChangeTurnParams,
  EventManager,
  WaiterInfo,
} from "../../base/event.manager.ts";
import { Player } from "../../base/player/player.state.ts";
import { ServerEventArgs } from "../../base/server.event.ts";
import { DefaultState } from "../cards/default.card.ts";
import { DefaultPlayerState } from "../player/default.player.state.ts";
import { ClientEventPayloads } from "./client/client-payloads.ts";
import { defaultTimeoutAction } from "./client/default-timeout.action.ts";
import { DEFAULT_EVENTS } from "./default-events.ts";
import { TimeoutEvent } from "./inner/timeout.event.ts";
import {
  DEFAULT_TURN_TIMEOUT,
  PermissionsEvent,
} from "./server/permissions.event.ts";

import { GameStartedEvent } from "./server/game-started.event.ts";
import { NewHandEvent } from "./server/new-hand.event.ts";
import { SerializedCard } from "./server/server-payloads.ts";
import { serializeCard } from "../utils/card.utils.ts";

import { RoomErrorEvent } from "../../../network/external.event.ts";
import { GameTimer } from "../../base/state.ts";
import { TimeoutToPlayer } from "./server/timeout-to-player.event.ts";

interface DefaultChangeTurnParams extends ChangeTurnParams<
  DefaultState,
  DefautlEventManager
> {}

export class DefautlEventManager
  extends EventEmitter
  implements EventManager<DefaultState>
{
  state: DefaultState;
  private victoryCallback?: (winnerId: number) => void;
  private nextWaiterId: number = 1;
  // informacao sobre os waiters, so esta aqui para debug mesmo o codigo nao precisa disso para funcionar
  public pendingWaitersInfo: WaiterInfo[] = [];
  public get waitersInfo(): WaiterInfo[] {
    return this.pendingWaitersInfo;
  }
  private pendingWaiters: Array<{
    cleanup: () => void;
    reject: (reason: any) => void;
  }> = [];

  constructor(state: DefaultState, onVictory?: (winnerId: number) => void) {
    super();
    this.state = state;
    this.victoryCallback = onVictory;
  }

  onVictory(winnerId: number): void {
    this.victoryCallback?.(winnerId);
  }

  /**
   * Inicializa o jogo:
   * 1. Seleciona o jogador inicial aleatoriamente.
   * 2. Distribui as cartas iniciais e envia a mão individualmente para cada cliente.
   * 3. Envia a carta virada do topo do descarte sem ativar seus efeitos.
   * 4. Envia as permissões para o jogador do turno inicial.
   */
  initGame(roomName: string = "", modeName: string = "") {
    const players = this.state.room.players;
    if (!players || players.length === 0) return;

    // 1. Escolhe o primeiro jogador aleatoriamente
    const randomIndex = Math.floor(Math.random() * players.length);
    const startingPlayer = players[randomIndex];
    this.state.turnManager.setupCurrentPlayerTurn(
      startingPlayer,
      this.state.room.turn,
    );

    // 2. Sacar as cartas da mão inicial para cada jogador
    const initialHandSize = 7;
    players.forEach((player) => {
      const cards = this.state.deckManager.draw(
        initialHandSize,
        this.state.room.deck,
      );
      player.hand = cards;
    });

    // 3. Serializar a carta descartada no começo do jogo (initialDiscard)
    const initialDiscard = serializeCard(this.state.room.deck.topDiscard);

    // 4. Enviar o evento GameStartedEvent para todos os jogadores ANTES do NewHandEvent
    this.emitToClient(
      new GameStartedEvent(null, players, {
        roomName: roomName || "",
        modeName: modeName || this.state.currentMode,
        configs: (this.state.configs as Record<string, unknown>) || {},
        initialDiscard,
        seed: this.state.seed,
      }),
    );

    // 5. Enviar a mão inicial para cada jogador individualmente
    players.forEach((player) => {
      this.emitToClient(
        new NewHandEvent(null, [player], {
          playerId: player.id,
          hand: player.hand.map(serializeCard),
        }),
      );
    });

    // 6. Iniciar o turno enviando as permissões para o jogador inicial
    return this.changeTurn();
  }

  emitToClient(serverEvent: ServerEventArgs<unknown>) {
    serverEvent.for.forEach((p) => p.network.sendToPlayer(serverEvent));
    this.emit(serverEvent.name, serverEvent);
  }

  tryChange({
    timeout = DEFAULT_TURN_TIMEOUT,
    timeoutAction,
  }: DefaultChangeTurnParams = {}) {
    if (this.state.victoryTriggered) {
      return;
    }
    if (!this.state.eventsForNextPlayer) {
      this.state.eventsForNextPlayer = DEFAULT_EVENTS;
    }
    this.state.turnManager.setupNextPlayerTurn(this.state.room.turn);
    this.changeTurn({
      eventsAllowed: this.state.eventsForNextPlayer,
      timeout,
      timeoutAction,
    });
  }

  changeTurn({
    eventsAllowed = DEFAULT_EVENTS,
    timeout = DEFAULT_TURN_TIMEOUT,
    timeoutAction,
  }: DefaultChangeTurnParams = {}) {
    // Os eventos permitidos podem ter vindo de um efeito que pode retornar undefinied,
    // por isso essa verificacao aqui
    if (this.state.victoryTriggered) {
      this.state.eventsValidMap.resetAll();
      return Promise.resolve({ eventReturned: "victory", data: {} });
    }
    if (!eventsAllowed) {
      eventsAllowed = DEFAULT_EVENTS;
    }
    const playerToPlay = this.state.room.turn.currentPlayer.value;
    this.state.eventsForNextPlayer = undefined;
    this.state.eventsValidMap.resetAll();
    this.state.eventsValidMap.set(playerToPlay, eventsAllowed);
    if (!timeoutAction) {
      timeoutAction = (
        state: DefaultState,
        eventManager: DefautlEventManager,
      ) => {
        return defaultTimeoutAction(
          state,
          eventManager,
          { playerId: playerToPlay.id },
          playerToPlay,
        );
      };
    }
    let allowedCards: SerializedCard[] = [];
    if (
      eventsAllowed.some((e) => e === ClientEventPayloads.PLAY_CARD.commomName)
    ) {
      allowedCards = this.state.playerManager
        .checkPlayCard(
          this.state.room.deck.topDiscard,
          playerToPlay,
          this.state,
        )
        .map(serializeCard);

      if (allowedCards.length === 0) {
        eventsAllowed = eventsAllowed.filter(
          (e) => e !== ClientEventPayloads.PLAY_CARD.commomName,
        );
      }
    }
    return this.waitForEvent(
      eventsAllowed,
      timeout,
      [playerToPlay],
      allowedCards,
      timeoutAction,
      {
        action: "changeTurn",
        cardId: this.state.room.deck.topDiscard?.id,
      },
    );
  }

  // O exclusively nao e mais necessario. Cada evento vai setar seus proximos eventos validos na callback desse
  // metodo ou apos ele. A unica coisa que ele vai fazer e configurar as permissoes atuais na sua invocacao, ele
  // o codigo nao precisa mais tentar adivinhar na chamada desse metodo se algum outro evento precisa ocorrer, ele
  // pode fazer isso depois

  // tenho que lembrar se criar um jeito de reavaliar o estado do jogo quando o codigo voltar de um await dentro de um evento
  // ou effect

  // adicionei a parte do timer dentro do jogo. Idealmente esse metodo sera usado quando um efeito ou evento precisar executar
  // alguma logica caso outro nao aconteca. O evento deplay card, por exemplo, precisa executar o efeito da carta se nao
  // houver um jumpin, nesse caso, o evento de timeout vai acaontecer para notificar o codigo e continuar sua execucao

  createCleanup(
    handlersMap: Map<string, (data: unknown, p: DefaultPlayerState) => void>,
    reject?: (reason: any) => void,
    waiterId?: number,
  ): (timer?: NodeJS.Timeout) => void {
    return (timer?: NodeJS.Timeout) => {
      const activeT = timer ?? this.state.activeTimer?.timer;
      if (activeT) {
        clearTimeout(activeT);
      }
      if (this.state.activeTimer?.timer) {
        clearTimeout(this.state.activeTimer.timer);
      }

      handlersMap.forEach((handler, name) => this.off(name, handler));

      this.state.eventsValidMap.resetAll();

      if (reject) {
        const idx = this.pendingWaiters.findIndex((w) => w.reject === reject);
        if (idx !== -1) {
          this.pendingWaiters.splice(idx, 1);
        }
      }

      if (waiterId !== undefined) {
        const idx = this.pendingWaitersInfo.findIndex((w) => w.id === waiterId);
        if (idx !== -1) {
          this.pendingWaitersInfo.splice(idx, 1);
        }
      }
    };
  }

  // esse metodo tambem sera usado para setar as permissoes para os players quando o change turn nao for suficiente.
  // Esse e o caso do jumpin, por exemplo
  waitForEvent(
    eventsName: string[],
    timeout: number,
    players: DefaultPlayerState[],
    allowedCards: SerializedCard[],
    timeoutAction?: (
      state: DefaultState,
      eventManager: DefautlEventManager,
    ) => void,
    meta?: {
      action?: string;
      cardId?: number;
    },
  ): Promise<{
    eventReturned: string;
    data: unknown;
    player?: DefaultPlayerState;
  }> {
    if (this.state.victoryTriggered) {
      return Promise.resolve({ eventReturned: "victory", data: {} });
    }
    let timeoutEvent: TimeoutEvent | undefined;
    if (timeout !== 0) {
      timeoutEvent = new TimeoutEvent(timeout, players, timeoutAction);
    }

    // Se houver algum timer ativo rodando de um evento anterior, cancela o timeout nativo
    if (this.state.activeTimer?.timer) {
      clearTimeout(this.state.activeTimer.timer);
    }
    this.state.activeTimer = undefined;

    // Registra os eventos permitidos para cada jogador específico
    this.state.eventsValidMap.resetAll();
    players.forEach((p) => {
      const next = [...eventsName];
      this.state.eventsValidMap.set(p, next);
    });

    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;
      const handlersMap = new Map<
        string,
        (data: unknown, p: DefaultPlayerState) => void
      >();

      const waiterId = this.nextWaiterId++;
      const resolvedCardId =
        meta?.cardId ??
        (allowedCards && allowedCards.length === 1
          ? allowedCards[0].id
          : undefined);

      const waiterInfo: WaiterInfo = {
        id: waiterId,
        action: meta?.action ?? eventsName[0] ?? "unknown",
        cardId: resolvedCardId,
        eventsName: [...eventsName],
        players: players.map((p) => p.id),
        createdAt: Date.now(),
      };
      this.pendingWaitersInfo.push(waiterInfo);

      const cleanup = this.createCleanup(handlersMap, reject, waiterId);

      this.pendingWaiters.push({ cleanup, reject });

      // 2. Criação dos Handlers com captura do emissor
      eventsName.forEach((name) => {
        const specificHandler = (
          data: unknown,
          emitterPlayer: DefaultPlayerState,
        ) => {
          // Garante que só resolve se o evento vier de um dos players esperados
          if (!players.some((p) => p.id === emitterPlayer.id)) return;

          cleanup();
          resolve({ eventReturned: name, data, player: emitterPlayer });
        };

        handlersMap.set(name, specificHandler);
        this.prependOnceListener(name, specificHandler);
      });

      if (timeout !== 0 && timeoutEvent) {
        const timeoutHandler = (data: unknown) => {
          cleanup();
          resolve({ eventReturned: timeoutEvent.name, data });
          this.emitToClient(
            new TimeoutToPlayer(this.state.room.players, {
              playerId: this.state.room.turn.currentPlayer.value.id,
            }),
          );
          timeoutEvent.action(this.state, this);
        };
        handlersMap.set(timeoutEvent.name, timeoutHandler);
        this.prependOnceListener(timeoutEvent.name, timeoutHandler);
        timer = setTimeout(() => {
          this.emit(timeoutEvent.name);
        }, timeout);

        const gTimer: GameTimer = {
          timer,
          createdAt: Date.now(),
          duration: timeout,
          isActive: true,
          eventsName: [...eventsName],
          allowedPlayers: players.map((p) => ({ id: p.id })),
          timeoutEventName: timeoutEvent.name,
          cleanup,
          timeoutActionCallback: timeoutAction,
        };
        this.state.activeTimer = gTimer;
      }

      queueMicrotask(() =>
        this.emitToClient(
          new PermissionsEvent(
            null,
            this.state.room.players,
            {
              allowedEvents: this.state.eventsValidMap.data,
              playerId: this.state.room.turn.currentPlayer.value.id,
              allowedCards,
            },
            timeout,
          ),
        ),
      );
    });
  }

  registerAction<Data, Return, CardType>(
    name: string,
    action: ActionSignature<Data, Return, CardType, DefaultState>,
  ): this {
    this.on(name, (data, player) =>
      action(this.state, this, data as Data, player as Player<CardType>),
    );
    return this;
  }

  pauseTimer(player: DefaultPlayerState) {
    const activeTimer = this.state.activeTimer;
    if (activeTimer && activeTimer.isActive) {
      const isAllowed = activeTimer.allowedPlayers.some(
        (p) => p.id === player.id,
      );
      if (isAllowed) {
        if (activeTimer.timer) {
          clearTimeout(activeTimer.timer);
        }
        activeTimer.isActive = false;
        // calculate remaining time and save it for reactivation
        const elapsed = Date.now() - activeTimer.createdAt;
        activeTimer.duration = Math.max(0, activeTimer.duration - elapsed);
      }
    }
  }

  sendErrorAndReactivateTimer(player: DefaultPlayerState, message: string) {
    this.emitToClient(new RoomErrorEvent(null, [player], { message }));
    const activeTimer = this.state.activeTimer;
    // Se não há timer ou se o timer ainda está rodando (erro na validação),
    // apenas enviamos o erro e deixamos o timer continuar correndo normalmente
    if (!activeTimer || activeTimer.isActive) {
      return;
    }

    // Só reativa se o timer anterior foi pausado (erro ocorrido pós-validação):
    activeTimer.allowedPlayers.forEach((p) => {
      this.state.eventsValidMap.set(p, [...activeTimer.eventsName]);
    });

    // Cria um novo handlersMap e novo cleanup para gerenciar o timer e os listeners reativados
    const handlersMap = new Map<
      string,
      (data: unknown, p: DefaultPlayerState) => void
    >();

    const cleanup = this.createCleanup(handlersMap);
    activeTimer.cleanup = cleanup;

    // Recria os listeners para os eventos esperados
    activeTimer.eventsName.forEach((name) => {
      const specificHandler = (
        _data: unknown,
        emitterPlayer: DefaultPlayerState,
      ) => {
        if (!activeTimer.allowedPlayers.some((p) => p.id === emitterPlayer.id))
          return;
        cleanup();
      };
      handlersMap.set(name, specificHandler);
      this.prependOnceListener(name, specificHandler);
    });

    // Recria o listener de timeout emitindo TimeoutToPlayer e chamando timeoutActionCallback
    // Isso poderia estar numa funcao separada para nao repetir codigo, mas esta ok por enquanto
    const timeoutHandler = () => {
      cleanup();
      this.emitToClient(
        new TimeoutToPlayer(this.state.room.players, {
          playerId: this.state.room.turn.currentPlayer.value.id,
        }),
      );
      if (activeTimer.timeoutActionCallback) {
        activeTimer.timeoutActionCallback(this.state, this);
      }
    };
    handlersMap.set(activeTimer.timeoutEventName, timeoutHandler);
    this.prependOnceListener(activeTimer.timeoutEventName, timeoutHandler);

    activeTimer.createdAt = Date.now();
    activeTimer.timer = setTimeout(() => {
      this.emit(activeTimer.timeoutEventName);
    }, activeTimer.duration);
    activeTimer.isActive = true;
  }

  cancelAllWaiters(): void {
    const waiters = [...this.pendingWaiters];
    this.pendingWaiters = [];
    waiters.forEach((w) => {
      w.cleanup();
      w.reject(new Error("Game Destroyed"));
    });
    this.pendingWaitersInfo = [];
  }
}
