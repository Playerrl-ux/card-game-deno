export interface RandomManager {
  initSeed(seed?: number): number;
  next(state: { seed?: number }): number;
  nextInt(max: number, state: { seed?: number }): number;
  shuffle<T>(array: T[], state?: { seed?: number }): T[];
  choice<T>(array: T[], state: { seed?: number }): T;
}
