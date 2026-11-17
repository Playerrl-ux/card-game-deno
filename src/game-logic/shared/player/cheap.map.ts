import { DefaultPlayerState } from "./default.player.state.ts";

export class CheapMap<k extends { id: number }, v> {
  size: number;
  keys: k[];
  data: v[][]; // o map vai associar cada key a um array do v

  constructor(size: number, keys: k[]) {
    this.size = size;
    this.keys = keys;
    this.data = Array.from({ length: size }, () => []) as v[][];
  }

  get(key: k) {
    if (key.id < 0 || key.id >= this.size) {
      return undefined;
    }
    return this.data[key.id];
  }

  set(key: k, data: v[]) {
    if (key.id < 0 || key.id >= this.size) {
      return undefined;
    }
    this.data[key.id] = data;
    return data;
  }

  reset(key: k) {
    if (key.id < 0 || key.id >= this.size) {
      return undefined;
    }
    this.data[key.id] = [];
    return [];
  }

  resetAll() {
    this.data = Array.from({ length: this.size }, () => []) as v[][];
    return this.data;
  }
}

export type DefaultMap = CheapMap<DefaultPlayerState, string>;
