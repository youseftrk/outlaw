/** Seeded PRNG (mulberry32) — deterministic demo world. */

export function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
  shuffle<T>(arr: T[]): T[];
  hex(len: number): string;
}

export function makeRng(seed: string | number): Rng {
  const rand = mulberry32(typeof seed === "string" ? hashSeed(seed) : seed);
  const rng: Rng = {
    next: rand,
    int: (min, max) => Math.floor(rand() * (max - min + 1)) + min,
    pick: (arr) => arr[Math.floor(rand() * arr.length)],
    chance: (p) => rand() < p,
    shuffle: (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    hex: (len) => {
      let s = "";
      const chars = "0123456789abcdef";
      for (let i = 0; i < len; i++) s += chars[Math.floor(rand() * 16)];
      return s;
    },
  };
  return rng;
}
