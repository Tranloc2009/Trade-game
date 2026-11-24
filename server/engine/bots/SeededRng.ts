/**
 * Deterministic Seeded PRNG (Mulberry32) for reproducible quantitative bot simulation and testing.
 * Never uses Math.random() inside agent decision paths.
 */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Returns a uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns a float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Returns an integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    if (max <= min) return min;
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Returns true with probability p in [0, 1]. */
  chance(p: number): boolean {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.next() < p;
  }

  /** Picks one element from a non-empty array deterministically. */
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Creates a child deterministic stream with an independent seed derived from parent + salt. */
  fork(salt: number | string): SeededRng {
    let hash = (this.state ^ 0x9e3779b9) >>> 0;
    if (typeof salt === 'number') {
      hash = Math.imul(hash ^ (salt >>> 0), 0x85ebca6b) >>> 0;
    } else {
      for (let i = 0; i < salt.length; i++) {
        hash = Math.imul(hash ^ salt.charCodeAt(i), 0x85ebca6b) >>> 0;
      }
    }
    return new SeededRng(hash || 1);
  }
}
