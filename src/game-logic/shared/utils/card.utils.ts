import { Card, DefaultState } from "../cards/default.card.ts";
import type { SerializedCard } from "../events/server/server-payloads.ts";

export function checkPlayCard(discardTop: Card, cards: Card[], state: DefaultState) {
  return cards.find((c) => c.canBePutOver(c, discardTop, state)) ? true : false;
}

export const serializeCard = (card: Card): SerializedCard => ({
  id: card.id,
  name: card.name,
  color: card.color,
  type: card.type,
  value: card.value,
  effectiveColor: card.effectiveColor,
});
