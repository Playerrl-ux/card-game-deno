import { Player } from "../../base/player/player.state.ts";

export function getEventArray(player: Player<any>, events: string[]) {
  const eventsValid: string[][] = [[], [], [], []];
  eventsValid[player.id] = events;
  return eventsValid;
}
