import { challengeEvent } from "./challenge.event.ts";
import { chooseColor } from "./choose-color.event.ts";
import { DefaultClientEvent } from "./client.default.event.ts";
import { drawChoiceEvent, keepEvent } from "./draw.choice.event.ts";
import { jumpInEvent } from "./jumpin.event.ts";
import { playCardEvent } from "./play-card.event.ts";
import { selectHandEvent } from "./select-hand.event.ts";
import { unoEvent } from "./uno.event.ts";
import { ClientEventPayloads } from "./client-payloads.ts";

export const clientEventsMap: Map<
  string,
  DefaultClientEvent<any, unknown>
> = new Map<string, DefaultClientEvent<any, unknown>>([
  [ClientEventPayloads.CHALLENGE.commomName, challengeEvent],
  [ClientEventPayloads.CHOOSE_COLOR.commomName, chooseColor],
  [ClientEventPayloads.DRAW_CHOICE.commomName, drawChoiceEvent],
  [ClientEventPayloads.KEEP_EVENT.commomName, keepEvent],
  [ClientEventPayloads.JUMP_IN.commomName, jumpInEvent],
  [ClientEventPayloads.PLAY_CARD.commomName, playCardEvent],
  [ClientEventPayloads.SELECT_HAND.commomName, selectHandEvent],
  [ClientEventPayloads.UNO.commomName, unoEvent],
]);
