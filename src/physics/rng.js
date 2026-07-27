// Small, fast, seedable PRNG. Seeded per spin from crypto.getRandomValues so each
// spin is reproducible (handy for the debug panel) but unpredictable across spins.
// Allocation-free draws keep the 10k headless batch fast.

// mulberry32
export function makeRng(seed) {
  let a = seed >>> 0;
  const rng = function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // uniform in [lo, hi]
  rng.range = (lo, hi) => lo + (hi - lo) * rng();
  // symmetric jitter in [-amp, amp]
  rng.jitter = (amp) => (rng() * 2 - 1) * amp;
  return rng;
}

// A fresh 32-bit seed. Uses crypto when available (browser + Node 24), else falls
// back to a time-based seed (only for exotic environments).
export function freshSeed() {
  try {
    const g = globalThis.crypto;
    if (g && g.getRandomValues) {
      const buf = new Uint32Array(1);
      g.getRandomValues(buf);
      return buf[0] >>> 0;
    }
  } catch {
    /* fall through */
  }
  return (Math.floor(performance.now?.() ?? 0) ^ 0x9e3779b9) >>> 0;
}
