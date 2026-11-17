import { Player } from "../../base/player/player.state.ts";
import { Card } from "../cards/default.card.ts";

export interface DefaultPlayerState extends Player<Card> {}
