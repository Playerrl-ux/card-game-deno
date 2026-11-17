import z from "zod";
import { chooseColor } from "../../events/client/choose-color.event.ts";
import { EventManager } from "../../../base/event.manager.ts";
import { timeoutName } from "../../events/inner/timeout.event.ts";
import { VoidServerEvent } from "../../events/server/void.events.ts";
import {
  ServerEventPayloads,
  ServerPayload,
} from "../../events/server/server-payloads.ts";
import { DefaultPlayerState } from "../../player/default.player.state.ts";
import {
  baseCanBePutOver,
  Card,
  COLOR,
  DefaulEffect,
  DefaultState,
  Type,
} from "../default.card.ts";

export const WILD_CONFIRMATION = "WILD_CONFIRMATION";
export const WILD_CHOOSE = ServerEventPayloads.WILD_CHOOSE.commomName;

export const wildEffect: DefaulEffect = async function (
  card: Card,
  state: DefaultState,
  eventManager: EventManager<DefaultState>,
  player: DefaultPlayerState,
) {
  let color: COLOR;
  const data = await eventManager.waitForEvent(
    [chooseColor.name],
    ServerEventPayloads.WILD_CHOOSE.timeout,
    [player],
    [],
    undefined,
    {
      action: chooseColor.name,
      cardId: card.id,
    },
  );

  if (data.eventReturned === timeoutName) {
    const validColors = [COLOR.RED, COLOR.BLUE, COLOR.GREEN, COLOR.YELLOW];
    color = state.randomManager
      ? state.randomManager.choice(validColors, state)
      : COLOR.RED;
  } else {
    const typedData = data.data as z.infer<typeof chooseColor.dataSchema>;
    color = COLOR[typedData.color as keyof typeof COLOR];
  }

  card.effectiveColor = color;

  eventManager.emitToClient(
    new VoidServerEvent<ServerPayload<"WILD_CHOOSE">>(
      ServerEventPayloads.WILD_CHOOSE.broadcastName,
      player,
      state.room.players,
      { color: color.toString() },
    ),
  );
};

export const createWild = (id: number, name: string) => {
  return {
    id,
    name,
    value: undefined,
    color: COLOR.WILD,
    effectiveColor: undefined,
    type: Type.WILD_CARD,
    effectBefore: wildEffect,
    effectAfter: () => {},
    canBePutOver: baseCanBePutOver,
  } as Card;
};
