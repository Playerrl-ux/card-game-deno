import { CardDrawEvent } from "./card-draw.event.ts";
import { ChanllengeResult } from "./challenge-result.event.ts";
import { ChangeDirectionEvent } from "./change-direction.event.ts";
import { ChooseEvent } from "./choose.event.ts";
import { Draw2Options } from "./draw2-options.event.ts";
import { HandChanged } from "./hand-changed.event.ts";
import { NewHandEvent } from "./new-hand.event.ts";
import { PermissionsEvent } from "./permissions.event.ts";
import { DefaultServerEvent } from "./server.default.event.ts";
import { ShowHandEvent } from "./show-hand.event.ts";
import { TimeoutToPlayer } from "./timeout-to-player.event.ts";
import { VoidServerEvent } from "./void.events.ts";
import { GameStartedEvent } from "./game-started.event.ts";
import { GameSnapshotEvent } from "./game-snapshot.event.ts";
import { ServerEventPayloads } from "./server-payloads.ts";

export const serverEventsMap = new Map<
  string,
  new (...args: any[]) => DefaultServerEvent<unknown>
>([
  [ServerEventPayloads.GAME_SNAPSHOT.commomName, GameSnapshotEvent],
  [ServerEventPayloads.GAME_STARTED.commomName, GameStartedEvent],
  [ServerEventPayloads.CARD_DRAW.commomName, CardDrawEvent],
  [ServerEventPayloads.CHALLENGE_RESULT.commomName, ChanllengeResult],
  [ServerEventPayloads.DIRECTION.commomName, ChangeDirectionEvent],
  [ServerEventPayloads.CHOOSE.commomName, ChooseEvent],
  [ServerEventPayloads.DRAW2_OPTIONS.commomName, Draw2Options],
  [ServerEventPayloads.HAND_CHANGED.commomName, HandChanged],
  [ServerEventPayloads.NEW_HAND.commomName, NewHandEvent],
  [ServerEventPayloads.PERMISSIONS.commomName, PermissionsEvent],
  [ServerEventPayloads.SHOW_HAND.commomName, ShowHandEvent],
  [ServerEventPayloads.TIMEOUT_TO_PLAYER.commomName, TimeoutToPlayer],
  [ServerEventPayloads.WIN.commomName, VoidServerEvent],
  [ServerEventPayloads.WIN.broadcastName, VoidServerEvent],
  [ServerEventPayloads.WILD_CHOOSE.commomName, VoidServerEvent],
  [ServerEventPayloads.WILD_CHOOSE.broadcastName, VoidServerEvent],
  [ServerEventPayloads.SEVEN_EFFECT_CHOOSE.commomName, VoidServerEvent],
  [ServerEventPayloads.SEVEN_EFFECT_CHOOSE.broadcastName, VoidServerEvent],

  // Eventos de ações do cliente (broadcasts):
  [ServerEventPayloads.PLAY_CARD.broadcastName, VoidServerEvent],
  [ServerEventPayloads.JUMP_IN.broadcastName, VoidServerEvent],
  [ServerEventPayloads.CHALLENGE.broadcastName, VoidServerEvent],
  [ServerEventPayloads.UNO.broadcastName, VoidServerEvent],
]);
