// Deterministic seeded pseudo-random helpers.

// 32-bit string/number hash → uint32 seed
export function hashSeed(input) {
  const str = String(input);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Mulberry32 PRNG — fast, deterministic, good enough for gameplay.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic hash of 2D integer coordinates + seed → [0,1)
export function hash2D(x, z, seed) {
  let h = seed >>> 0;
  h = Math.imul(h ^ (x | 0), 0x85EBCA6B);
  h = Math.imul(h ^ (z | 0), 0xC2B2AE35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27D4EB2F);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function hash3D(x, y, z, seed) {
  let h = seed >>> 0;
  h = Math.imul(h ^ (x | 0), 0x85EBCA6B);
  h = Math.imul(h ^ (y | 0), 0xC2B2AE35);
  h = Math.imul(h ^ (z | 0), 0x27D4EB2F);
  h ^= h >>> 13;
  h = Math.imul(h, 0x165667B1);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
