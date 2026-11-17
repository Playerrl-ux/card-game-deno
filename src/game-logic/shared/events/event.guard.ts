import { ClientEvent } from "../../base/client.event.ts";
import { EventGuard } from "../../base/event.guard.ts";
import { ServerEventArgs } from "../../base/server.event.ts";
import { State } from "../../base/state.ts";
import { DefaultPlayerState } from "../player/default.player.state.ts";
import { DefaultState } from "../cards/default.card.ts";
import { clientEventsMap } from "./client/events.map.ts";
import { DefautlEventManager } from "./event.manager.ts";

import { DefaultStateManager } from "../state/functions/state.functions.ts";
import { GameSnapshotEvent } from "./server/game-snapshot.event.ts";
import { RoomErrorEvent } from "../../../network/external.event.ts";

export class DefaultEventGuard extends EventGuard {
  state: DefaultState;
  declare eventManager: DefautlEventManager;

  constructor(state: DefaultState, onVictory?: (winnerId: number) => void) {
    const eventManager = new DefautlEventManager(state, onVictory);
    super(eventManager);
    this.state = state;

    clientEventsMap.forEach((event, name) => {
      eventManager.registerAction(name, event.action);
    });
  }

  // tipar event data
  guard(
    player: DefaultPlayerState,
    eventName: string,
    eventData: unknown,
  ): void {
    if (this.state.victoryTriggered) {
      return;
    }
    if (!eventName) {
      const message = "Client event arrive without a name";
      this.eventManager.emitToClient(
        new RoomErrorEvent(null, [player], { message }),
      );
      throw new Error(message);
    }
    const name = eventName;
    if (player.network) {
      player.network.lastClientEventName = name;
    }

    if (
      !this.state.eventsValidMap ||
      !this.state.eventsValidMap.get(player)?.includes(name)
    ) {
      const message = "Player isnt allowed to do this event: " + name;
      this.eventManager.sendErrorAndReactivateTimer(player, message);
      throw new Error(message);
    }
    const event = clientEventsMap.get(name) as ClientEvent<
      { playerId: number },
      unknown,
      unknown,
      State<any, any>
    >;
    if (!event) {
      const message = "Event not found by name: " + name;
      this.eventManager.sendErrorAndReactivateTimer(player, message);
      throw new Error(message);
    }
    let data: { playerId: number };
    try {
      data = event.dataSchema.parse(eventData);
    } catch (_err) {
      const message = "Invalid data payload structure for event: " + name;
      this.eventManager.sendErrorAndReactivateTimer(player, message);
      throw new Error(message);
    }
    if (event.validateData) {
      const isValid = event.validateData(
        this.state,
        this.eventManager,
        data,
        player,
      );
      if (!isValid) {
        console.log("Invalid data for event: " + name);
        const message = "Invalid data for event: " + name;
        this.eventManager.sendErrorAndReactivateTimer(player, message);
        throw new Error(message);
      }
    }

    // Pausar o timer do jogador somente após validação bem-sucedida, antes de executar a ação
    this.eventManager.pauseTimer(player);

    // resetando as permissoes pra prevenir merda
    this.state.eventsValidMap.resetAll();
    this.state.eventsForNextPlayer = undefined;
    
    try {
      this.eventManager.emit(name, data, player);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Game Logic Error";
      this.eventManager.sendErrorAndReactivateTimer(player, message);
      throw err;
    }
  }

  manageBotAction(botId: number, event: ServerEventArgs<unknown>): void {
    this.state.botManager?.onBotServerEvent(
      botId,
      event,
      this.state,
      this.eventManager,
    );
  }

  requestSnapshot(player: DefaultPlayerState): void {
    const snapshot = DefaultStateManager.createSnapshot(this.state, player);
    this.eventManager.emitToClient(
      new GameSnapshotEvent(null, [player], snapshot),
    );
  }
}
