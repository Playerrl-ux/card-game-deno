import z from "zod";
import { selectHandEvent } from "../../events/client/select-hand.event.ts";
import { EventManager } from "../../../base/event.manager.ts";
import { timeoutName } from "../../events/inner/timeout.event.ts";
import { HandChanged } from "../../events/server/hand-changed.event.ts";
import { VoidServerEvent } from "../../events/server/void.events.ts";
import { NewHandEvent } from "../../events/server/new-hand.event.ts";
import {
  ServerEventPayloads,
  ServerPayload,
} from "../../events/server/server-payloads.ts";
import { serializeCard } from "../../utils/card.utils.ts";
import { DefaultPlayerState } from "../../player/default.player.state.ts";
import {
  baseCanBePutOver,
  Card,
  COLOR,
  Configs,
  DefaulEffect,
  DefaultState,
  Type,
} from "../default.card.ts";

export const EFFECT_PREFIX = "7_EFFECT";
export const EFFECT_CHOOSE = ServerEventPayloads.SEVEN_EFFECT_CHOOSE.commomName;

export const sevenSpecialEffect: DefaulEffect = async function (
  card: Card,
  state: DefaultState,
  eventManager: EventManager<DefaultState>,
  player: DefaultPlayerState,
) {
  let playerChoosed: DefaultPlayerState | undefined;

  const data = await eventManager.waitForEvent(
    [selectHandEvent.name],
    ServerEventPayloads.SEVEN_EFFECT_CHOOSE.timeout,
    [player],
    [],
    undefined,
    {
      action: selectHandEvent.name,
      cardId: card.id,
    },
  );

  let targetId: number;
  if (data.eventReturned == timeoutName) {
    // implementar logica de escolha aleatoria aqui
    playerChoosed = state.turnManager.getNext(
      player,
      state.room.turn,
    ) as DefaultPlayerState;
    targetId = state.room.players.indexOf(playerChoosed);
  } else {
    const typedData = data.data as z.infer<typeof selectHandEvent.dataSchema>;
    playerChoosed = state.room.players[typedData.targetId];
    if (playerChoosed === player) {
      //implementar uma logica menos agressiva aqui, talvez setando manualmente o player a ser escolhido
      throw new Error("You cannot chose itself for the seven effect");
    }
    targetId = typedData.targetId;
  }

  // evento para notificar os outros players da escolha
  eventManager.emitToClient(
    new VoidServerEvent<ServerPayload<"SEVEN_EFFECT_CHOOSE">>(
      ServerEventPayloads.SEVEN_EFFECT_CHOOSE.broadcastName,
      player,
      state.room.players,
      { targetId: targetId },
    ),
  );

  const hand = player.hand;
  player.hand = playerChoosed.hand;
  playerChoosed.hand = hand;

  // Notifica todos os jogadores sobre a troca de mãos
  eventManager.emitToClient(
    new HandChanged(player, state.room.players, {
      playerId: player.id,
      targetId,
    }),
  );

  eventManager.emitToClient(
    new NewHandEvent(null, [player], {
      playerId: player.id,
      hand: player.hand.map(serializeCard),
    }),
  );

  eventManager.emitToClient(
    new NewHandEvent(null, [playerChoosed], {
      playerId: playerChoosed.id,
      hand: playerChoosed.hand.map(serializeCard),
    }),
  );
};

export const sevenBeforeEffect: DefaulEffect = () => {};
export const sevenAfterEffect: DefaulEffect = sevenSpecialEffect;

const createSevenEffect = (configs: Configs) => {
  if (configs.SEVEN_HAS_EFFECT) {
    return sevenSpecialEffect;
  }
  return () => {
    return undefined;
  };
};

export const create7 = (
  configs: Configs,
  id: number,
  color: COLOR,
  name: string,
) => {
  return {
    id,
    name,
    value: 7,
    color,
    effectiveColor: color,
    type: Type.NUMBERED,
    effectBefore: () => {},
    effectAfter: createSevenEffect(configs),
    canBePutOver: baseCanBePutOver,
  } as Card;
};
