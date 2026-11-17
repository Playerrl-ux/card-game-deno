import { ModeIniter, ModeTypes } from "../game-logic/base/mode.ts";
import {
  DefaultModeIniter,
  DefaultTypes,
} from "../game-logic/modes/default-mode/default-mode.ts";

export const modesMap: Map<string, ModeIniter<any>> = new Map([
  [DefaultModeIniter.name, DefaultModeIniter],
]);
