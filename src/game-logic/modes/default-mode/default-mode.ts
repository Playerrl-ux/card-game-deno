import { BotManager } from "../../../bot/bot.manager.ts";
import { TestPlayEvent } from "../../../network/external.event.ts";
import { EventSocket } from "../../base/event.guard.ts";
import { Mode, ModeIniter, ModeTypes } from "../../base/mode.ts";
import {
  Card,
  configSchema,
  DefaultDeckState,
  DefaultState,
  DefaultTurnState,
} from "../../shared/cards/default.card.ts";
import { DefaultGenerator } from "../../shared/cards/generator.ts";
import { DefaultEventGuard } from "../../shared/events/event.guard.ts";
import { DefautlEventManager } from "../../shared/events/event.manager.ts";
import { DefaultPlayerManager } from "../../shared/player/default.player.manager.ts";
import { DefaultPlayerState } from "../../shared/player/default.player.state.ts";
import { DefaultDeckManager } from "../../shared/state/functions/deck.functions.ts";
import { DefaultStateManager } from "../../shared/state/functions/state.functions.ts";
import { DefaultTurnManager } from "../../shared/state/functions/turn.functions.ts";
import { defaultQuantities } from "./default-quantities.ts";

export interface DefaultTypes extends ModeTypes {
  CardType: Card;
  ConfigType: Configs;
  PlayerStateType: DefaultPlayerState;
  TurnStateType: DefaultTurnState;
  DeckStateType: DefaultDeckState;
  StateType: DefaultState;

  TurnManagerType: typeof DefaultTurnManager;
  DeckManagerType: typeof DefaultDeckManager;
  StateManagerType: typeof DefaultStateManager;
  EventManagerType: DefautlEventManager;
  EventGuardType: DefaultEventGuard;
  CardGeneratorType: typeof DefaultGenerator;
  PlayerManager: typeof DefaultPlayerManager;
}

export interface Configs {
  SEVEN_HAS_EFFECT: boolean;
  ZERO_HAS_EFFECT: boolean;
  DRAW_2_OVER_DRAW_4: boolean;
  DRAW_UNTIL_HAVE: boolean;
  JUMPIN: boolean;
  DRAW_4_CHALLENGES: boolean;
  CanWin?: boolean;
  isTestRoom?: boolean;
}

export const DefaultModeIniter: ModeIniter<DefaultTypes> = {
  name: "Default",
  quantities: defaultQuantities,
  configsSchema: configSchema,
  init: function (
    players: DefaultPlayerState[],
    configs: Configs,
    numberOfDecks: number,
    networkLayer: EventSocket,
    onVictory: (winnerId: number) => void,
    seed?: number,
  ) {
    const effectiveSeed = seed ?? (configs as any)?.seed;
    const state = DefaultStateManager.createState(
      players,
      configs,
      defaultQuantities,
      numberOfDecks,
      effectiveSeed,
    );
    const eventGuard = new DefaultEventGuard(state, onVictory);

    const botManager = new BotManager();
    botManager.handleClientEvent = (
      eventName: string,
      data: unknown,
      botId: number,
    ) => {
      const player = state.room.players.find((p) => p.id === botId);
      if (player) {
        if (configs.isTestRoom && player.network) {
          const testEvent = new TestPlayEvent(null, [player], {
            eventName,
            data,
          });
          player.network.sendToPlayer(testEvent);
        } else {
          eventGuard.guard(player, eventName, data);
        }
      }
    };
    state.botManager = botManager;

    return {
      name: this.name,
      turnManager: DefaultTurnManager,
      deckManager: DefaultDeckManager,
      stateManager: DefaultStateManager,
      eventManager: eventGuard.eventManager,
      eventGuard: eventGuard,
      cardGenerator: DefaultGenerator,
      playerManager: DefaultPlayerManager,
    } as Mode<DefaultTypes>;
  },
};
