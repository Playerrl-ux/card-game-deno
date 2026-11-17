import { DefaultPlayerState } from "../player/default.player.state.ts";
import { DefaultState } from "./default.card.ts";
import { drawChoiceEvent } from "../events/client/draw.choice.event.ts";
import { VoidServerEvent } from "../events/server/void.events.ts";
import {
  ServerEventPayloads,
  ServerPayload,
} from "../events/server/server-payloads.ts";
import { EventManager } from "../../base/event.manager.ts";

export async function checkVictory(
  state: DefaultState,
  eventManager: EventManager<DefaultState>,
  player?: DefaultPlayerState,
): Promise<boolean> {
  const winner =
    player && player.hand.length === 0
      ? player
      : state.room.players.find((p) => p.hand.length === 0);

  if (winner) {
    if (state.configs.CanWin) {
      state.victoryTriggered = true;
      state.eventsValidMap.resetAll();
      if (state.room.currentDraw > 0) {
        const nextPlayer = state.turnManager.getNext(winner, state.room.turn);
        if (nextPlayer) {
          await drawChoiceEvent.action(
            state,
            eventManager,
            { playerId: nextPlayer.id },
            nextPlayer,
          );
        }
      }
      eventManager.emitToClient(
        new VoidServerEvent<ServerPayload<"WIN">>(
          ServerEventPayloads.WIN.broadcastName,
          winner,
          state.room.players,
          {},
        ),
      );
      eventManager.onVictory(winner.id);
      return true;
    } else {
      eventManager.emitToClient(
        new VoidServerEvent<ServerPayload<"WIN">>(
          ServerEventPayloads.WIN.broadcastName,
          winner,
          state.room.players,
          {},
        ),
      );
      // retornar false significa que o jogo nao acabou mesmo com alguem zerando a mao
      return false;
    }
  }
  return false;
}
