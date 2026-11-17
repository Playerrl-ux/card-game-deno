import { RandomManager } from "../../base/random.manager.ts";

export function mulberry32(a: number): { value: number; nextSeed: number } {
  let t = (a += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, nextSeed: a >>> 0 };
}

export const DefaultRandomManager: RandomManager = {
  initSeed(seed?: number): number {
    return seed !== undefined ? seed : Math.floor(Math.random() * 2147483647);
  },

  next(state: { seed?: number }): number {
    if (state.seed === undefined) {
      state.seed = this.initSeed();
    }
    const { value, nextSeed } = mulberry32(state.seed);
    state.seed = nextSeed;
    return value;
  },

  nextInt(max: number, state: { seed?: number }): number {
    if (max <= 0) return 0;
    return Math.floor(this.next(state) * max);
  },

  shuffle<T>(array: T[], state?: { seed?: number }): T[] {
    const newArray = [...array];
    const stateObj = state || { seed: this.initSeed() };
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1, stateObj);
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  },

  choice<T>(array: T[], state: { seed?: number }): T {
    const index = this.nextInt(array.length, state);
    return array[index];
  },
};
