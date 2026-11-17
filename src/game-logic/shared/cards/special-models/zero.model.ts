import { EventManager } from "../../../base/event.manager.ts";
import { NewHandEvent } from "../../events/server/new-hand.event.ts";
import { DefaultPlayerState } from "../../player/default.player.state.ts";
import { serializeCard } from "../../utils/card.utils.ts";
import {
  baseCanBePutOver,
  Card,
  COLOR,
  Configs,
  DefaulEffect,
  DefaultState,
  Type,
} from "../default.card.ts";

export const zeroSpecialEffect: DefaulEffect = async function (
  _card: Card,
  state: DefaultState,
  eventManager: EventManager<DefaultState>,
  player: DefaultPlayerState,
) {
  let currentPlayer: DefaultPlayerState = player;
  let hand = player.hand;

  //preciso ver se essa logica funciona
  do {
    const next = state.turnManager.getNext(currentPlayer, state.room.turn);
    const earlierHand = next.hand;
    next.hand = hand;
    hand = earlierHand;
    currentPlayer = next;
  } while (currentPlayer !== player);

  state.room.players.forEach((p) =>
    eventManager.emitToClient(
      new NewHandEvent(null, [p], {
        playerId: p.id,
        hand: p.hand.map(serializeCard),
      }),
    ),
  );
};

const createZeroEffect = (configs: Configs) => {
  if (configs.ZERO_HAS_EFFECT) {
    return zeroSpecialEffect;
  }
  return () => {
    return undefined;
  };
};

export const create0 = (
  configs: Configs,
  id: number,
  color: COLOR,
  name: string,
) => {
  return {
    id,
    name,
    value: 0,
    color,
    effectiveColor: color,
    type: Type.NUMBERED,
    // Se essa carta for a ultima na mao de alguem e for jogada,
    // vai acontecer um bug e quando chegar na vez do outro player, o jogo vai travar
    effectBefore: createZeroEffect(configs),
    effectAfter: () => {},
    canBePutOver: baseCanBePutOver,
  } as Card;
};
