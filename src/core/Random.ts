/**
 * Small deterministic PRNG helpers.
 *
 * The track generator must be reproducible for tests, so every random decision
 * on the track comes from one of these generators instead of Math.random().
 */

/** mulberry32 - fast, tiny, good enough for level generation. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RandomSource {
  next(): number;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  chance(probability: number): boolean;
}

export function createRandom(seed: number): RandomSource {
  const next = mulberry32(seed);
  return {
    next,
    int(minInclusive: number, maxInclusive: number): number {
      if (maxInclusive < minInclusive) return minInclusive;
      return minInclusive + Math.floor(next() * (maxInclusive - minInclusive + 1));
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('pick() called with an empty list');
      return items[Math.floor(next() * items.length)] as T;
    },
    chance(probability: number): boolean {
      return next() < probability;
    },
  };
}
