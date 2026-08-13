// Procedural terrain generation: height, climate, biomes, caves, ores, trees, plants.
// All functions are deterministic per world seed and world coordinate, so features
// (like trees) can safely span chunk borders.

import { CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL } from '../core/constants.js';
import { Noise } from '../core/noise.js';
import { hash2D, hash3D, hashSeed, mulberry32 } from '../core/rng.js';
import { B } from './BlockRegistry.js';
import { Biome, BIOME_DEFS, selectBiome } from './Biomes.js';
import { blockIndex } from './Chunk.js';

const TREE_MARGIN = 3; // canopy blocks that may reach into a neighboring chunk

export class WorldGenerator {
  constructor(seed) {
    this.seed = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
    this.continentNoise = new Noise(this.seed ^ 0x1111);
    this.hillNoise = new Noise(this.seed ^ 0x2222);
    this.mountainNoise = new Noise(this.seed ^ 0x3333);
    this.detailNoise = new Noise(this.seed ^ 0x4444);
    this.tempNoise = new Noise(this.seed ^ 0x5555);
    this.humidNoise = new Noise(this.seed ^ 0x6666);
    this.caveNoise = new Noise(this.seed ^ 0x7777);
    this.caveNoise2 = new Noise(this.seed ^ 0x8888);
    this.riverNoise = new Noise(this.seed ^ 0x9999);

    this.heightCache = new Map(); // column key -> height (small LRU-ish cache)
  }

  // --- Climate ---
  temperature(wx, wz) {
    return this.tempNoise.fbm2D(wx / 900, wz / 900, 3);
  }

  humidity(wx, wz) {
    return this.humidNoise.fbm2D(wx / 700, wz / 700, 3);
  }

  // --- Terrain height for a world column (deterministic, cacheable) ---
  height(wx, wz) {
    const key = wx + ',' + wz;
    const cached = this.heightCache.get(key);
    if (cached !== undefined) return cached;

    // Continentalness: big landmasses vs oceans
    const cont = this.continentNoise.fbm2D(wx / 1400, wz / 1400, 4);
    // Rolling hills
    const hills = this.hillNoise.fbm2D(wx / 180, wz / 180, 4);
    // Mountain ridges, gated by a mountain mask
    const mMask = Math.max(0, this.mountainNoise.fbm2D(wx / 800 + 100, wz / 800 - 100, 3));
    const ridge = this.mountainNoise.ridged2D(wx / 260, wz / 260, 4);
    // Fine detail
    const detail = this.detailNoise.fbm2D(wx / 40, wz / 40, 3);

    let h = SEA_LEVEL + 4 + cont * 26;
    h += hills * 9;
    h += mMask * mMask * ridge * 46;
    h += detail * 3;

    // Rivers: carve where river noise crosses zero on land
    const rv = this.riverNoise.fbm2D(wx / 420, wz / 420, 3);
    const rAbs = Math.abs(rv);
    if (rAbs < 0.045 && h > SEA_LEVEL - 2) {
      const t = 1 - rAbs / 0.045; // 0..1 toward river center
      const target = SEA_LEVEL - 2.5;
      h = h * (1 - t * 0.9) + target * (t * 0.9);
    }

    let hi = Math.round(h);
    if (hi < 4) hi = 4;
    if (hi > WORLD_HEIGHT - 10) hi = WORLD_HEIGHT - 10;

    if (this.heightCache.size > 60000) this.heightCache.clear();
    this.heightCache.set(key, hi);
    return hi;
  }

  biomeAt(wx, wz) {
    const h = this.height(wx, wz);
    return selectBiome(this.temperature(wx, wz), this.humidity(wx, wz), h, SEA_LEVEL);
  }

  // --- Caves: combination of two 3D noises makes tunnels + chambers ---
  isCave(wx, y, wz, surfaceH) {
    if (y <= 2 || y > surfaceH + 1) return false;
    // spaghetti tunnels: |n1| and |n2| both near zero
    const n1 = this.caveNoise.fbm3D(wx / 90, y / 60, wz / 90, 3);
    const n2 = this.caveNoise2.fbm3D(wx / 90 + 50, y / 60 - 50, wz / 90 + 50, 3);
    const tunnel = (n1 * n1 + n2 * n2) < 0.0075;
    if (tunnel) {
      // don't punch through under oceans/rivers near sea level
      if (y > SEA_LEVEL - 6 && surfaceH <= SEA_LEVEL) return false;
      return true;
    }
    // big chambers deeper down
    if (y < 42) {
      const ch = this.caveNoise.noise3D(wx / 130, y / 70, wz / 130);
      if (ch > 0.62 - (42 - y) * 0.002) return true;
    }
    return false;
  }

  // Underground lakes: water fills chamber floors below y=24
  // handled in generate() by filling carved air below LAKE_LEVEL with water.

  // --- Ore veins: deterministic seeded veins per 8^3 region ---
  // Returns block id or 0 for the given stone position.
  oreAt(wx, y, wz) {
    // Each ore type gets vein "seeds" on a sparse lattice; blocks near a seed become ore.
    // Cheap approximation of vein generation with good clustering.
    const cellX = Math.floor(wx / 8), cellY = Math.floor(y / 8), cellZ = Math.floor(wz / 8);
    for (const ore of ORE_TABLE) {
      if (y < ore.minY || y > ore.maxY) continue;
      const r = hash3D(cellX, cellY, cellZ, this.seed ^ ore.salt);
      if (r > ore.cellChance) continue;
      // vein center inside the cell
      const r2 = mulberry32((this.seed ^ ore.salt) + cellX * 341873 + cellY * 132897 + cellZ * 9301);
      const cx = cellX * 8 + r2() * 8;
      const cy = cellY * 8 + r2() * 8;
      const cz = cellZ * 8 + r2() * 8;
      const dx = wx - cx, dy = y - cy, dz = wz - cz;
      const d2 = dx * dx + dy * dy * 1.8 + dz * dz;
      if (d2 < ore.radius * ore.radius) {
        // sprinkle: not every block in radius is ore
        if (hash3D(wx, y, wz, this.seed ^ ore.salt ^ 0xABCD) < ore.density) return ore.block;
      }
    }
    return 0;
  }

  // Deterministic tree/feature decision for a world column.
  // Returns null or { type, height } — decided only by (wx, wz, seed).
  treeAt(wx, wz) {
    const biome = this.biomeAt(wx, wz);
    const def = BIOME_DEFS[biome];
    if (!def.treeChance) return null;
    const h = this.height(wx, wz);
    if (h <= SEA_LEVEL) return null;
    const r = hash2D(wx, wz, this.seed ^ 0xF00D);
    if (r > def.treeChance) return null;
    // avoid trees adjacent to each other: winner-takes-cell on 3x3
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx === 0 && dz === 0) continue;
        const nb = hash2D(wx + dx, wz + dz, this.seed ^ 0xF00D);
        const nbBiome = this.biomeAt(wx + dx, wz + dz);
        const nbDef = BIOME_DEFS[nbBiome];
        if (nbDef.treeChance && nb <= nbDef.treeChance && nb < r) return null;
      }
    }
    const sizeR = hash2D(wx, wz, this.seed ^ 0xBEEF);
    if (def.treeType === 'cactus') {
      return { type: 'cactus', height: 2 + Math.floor(sizeR * 3) };
    }
    if (def.treeType === 'fir') {
      return { type: 'fir', height: 6 + Math.floor(sizeR * 4) };
    }
    return { type: 'oak', height: 4 + Math.floor(sizeR * 3) };
  }

  // --- Full chunk generation ---
  generate(chunk) {
    const { cx, cz } = chunk;
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    const blocks = chunk.blocks;

    const heights = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    const biomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);

    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = baseX + x, wz = baseZ + z;
        const h = this.height(wx, wz);
        heights[x | (z << 4)] = h;
        biomes[x | (z << 4)] = selectBiome(this.temperature(wx, wz), this.humidity(wx, wz), h, SEA_LEVEL);
      }
    }

    const LAKE_LEVEL = 22;

    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = baseX + x, wz = baseZ + z;
        const h = heights[x | (z << 4)];
        const biome = biomes[x | (z << 4)];
        const def = BIOME_DEFS[biome];

        for (let y = 0; y <= Math.max(h, SEA_LEVEL); y++) {
          const idx = blockIndex(x, y, z);
          let id = B.AIR;

          if (y === 0) {
            id = B.BEDROCK;
          } else if (y <= h) {
            if (this.isCave(wx, y, wz, h)) {
              // carved — underground lake fill
              id = y <= LAKE_LEVEL && y < h - 4 ? B.WATER : B.AIR;
            } else if (y === h) {
              // surface block
              if (h < SEA_LEVEL + 2 && biome !== Biome.DRYLANDS && (biome === Biome.OCEAN || biome === Biome.SHORES)) {
                id = h < SEA_LEVEL - 8 ? B.GRAVEL : B.SAND;
              } else {
                id = h <= SEA_LEVEL ? (def.top === B.GRASS ? B.DIRT : def.top) : def.top;
              }
            } else if (y >= h - 3) {
              id = def.deepFiller && y < h - 1 ? def.deepFiller : def.filler;
              if (def.rocky && h > SEA_LEVEL + 24) id = B.STONE;
            } else {
              id = B.STONE;
              const ore = this.oreAt(wx, y, wz);
              if (ore) id = ore;
              else if (y > h - 8 && hash3D(wx, y, wz, this.seed ^ 0x515) < 0.03) id = B.GRAVEL;
            }
          } else if (y <= SEA_LEVEL) {
            // water above terrain up to sea level
            id = (this.temperature(wx, wz) < -0.5 && y === SEA_LEVEL) ? B.ICE : B.WATER;
          }
          blocks[idx] = id;
        }

        // clay patches under shallow water
        if (h <= SEA_LEVEL && h > SEA_LEVEL - 5 && hash2D(wx, wz, this.seed ^ 0xC1A) < 0.1) {
          blocks[blockIndex(x, h, z)] = B.CLAY;
        }
      }
    }

    // --- Decorations: trees (with cross-chunk margin) and plants ---
    for (let z = -TREE_MARGIN; z < CHUNK_SIZE + TREE_MARGIN; z++) {
      for (let x = -TREE_MARGIN; x < CHUNK_SIZE + TREE_MARGIN; x++) {
        const wx = baseX + x, wz = baseZ + z;
        const tree = this.treeAt(wx, wz);
        if (!tree) continue;
        const h = this.height(wx, wz);
        if (this.isCave(wx, h, wz, h)) continue;
        this.placeTree(chunk, x, h + 1, z, tree);
      }
    }

    // small plants — only inside the chunk
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = baseX + x, wz = baseZ + z;
        const h = heights[x | (z << 4)];
        if (h <= SEA_LEVEL || h + 1 >= WORLD_HEIGHT) continue;
        const biome = biomes[x | (z << 4)];
        const def = BIOME_DEFS[biome];
        if (!def.plantChance || !def.plants.length) continue;
        const ground = blocks[blockIndex(x, h, z)];
        if (ground !== def.top && ground !== B.GRASS && ground !== B.SAND && ground !== B.SNOW) continue;
        if (blocks[blockIndex(x, h + 1, z)] !== B.AIR) continue;
        const r = hash2D(wx, wz, this.seed ^ 0x9EED);
        if (r < def.plantChance) {
          let pick = r / def.plantChance;
          for (const [plantId, weight] of def.plants) {
            if (pick < weight) { blocks[blockIndex(x, h + 1, z)] = plantId; break; }
            pick -= weight;
          }
        }
      }
    }

    chunk.computeHeightMap();
  }

  // Place a tree whose trunk is at local (x, y, z) — coordinates may be
  // outside [0,16); only blocks inside this chunk are written.
  placeTree(chunk, x, y, z, tree) {
    const put = (lx, ly, lz, id, force = false) => {
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || ly < 0 || ly >= WORLD_HEIGHT) return;
      const idx = blockIndex(lx, ly, lz);
      if (!force && chunk.blocks[idx] !== B.AIR) return;
      chunk.blocks[idx] = id;
    };

    if (tree.type === 'cactus') {
      for (let i = 0; i < tree.height; i++) put(x, y + i, z, B.CACTUS, true);
      return;
    }

    if (tree.type === 'fir') {
      // conical evergreen
      for (let i = 0; i < tree.height; i++) put(x, y + i, z, B.LOG, true);
      let radius = 2;
      for (let ly = y + 2; ly <= y + tree.height; ly += 1) {
        const r = Math.max(1, Math.round(radius * (1 - (ly - y - 2) / tree.height)));
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (dx === 0 && dz === 0 && ly < y + tree.height) continue;
            if (Math.abs(dx) + Math.abs(dz) > r + 0.5) continue;
            put(x + dx, ly, z + dz, B.LEAVES);
          }
        }
      }
      put(x, y + tree.height, z, B.LEAVES);
      return;
    }

    // oak-like round tree
    const th = tree.height;
    for (let i = 0; i < th; i++) put(x, y + i, z, B.LOG, true);
    for (let ly = y + th - 2; ly <= y + th + 1; ly++) {
      const r = ly >= y + th ? 1 : 2;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx === 0 && dz === 0 && ly < y + th) continue;
          if (Math.abs(dx) === r && Math.abs(dz) === r && (ly === y + th + 1 || ly === y + th - 2)) continue;
          put(x + dx, ly, z + dz, B.LEAVES);
        }
      }
    }
  }

  // Find a safe spawn near the origin: land above sea level.
  findSpawn() {
    for (let radius = 0; radius < 64; radius += 4) {
      for (let attempt = 0; attempt < 16; attempt++) {
        const ang = (attempt / 16) * Math.PI * 2;
        const wx = Math.round(Math.cos(ang) * radius);
        const wz = Math.round(Math.sin(ang) * radius);
        const h = this.height(wx, wz);
        if (h > SEA_LEVEL + 1 && !this.isCave(wx, h, wz, h)) {
          return { x: wx + 0.5, y: h + 2.2, z: wz + 0.5 };
        }
      }
    }
    return { x: 0.5, y: this.height(0, 0) + 3, z: 0.5 };
  }
}

// Ore distribution table (vein-based)
const ORE_TABLE = [
  { block: B.COAL_ORE, salt: 0xC0A1, minY: 8, maxY: 100, cellChance: 0.36, radius: 2.6, density: 0.72 },
  { block: B.COPPER_ORE, salt: 0xC0BB, minY: 30, maxY: 80, cellChance: 0.24, radius: 2.2, density: 0.66 },
  { block: B.IRON_ORE, salt: 0x1207, minY: 8, maxY: 56, cellChance: 0.26, radius: 2.2, density: 0.64 },
  { block: B.GOLD_ORE, salt: 0x907D, minY: 4, maxY: 28, cellChance: 0.16, radius: 1.8, density: 0.6 },
  { block: B.CRYSTAL_ORE, salt: 0xCE55, minY: 2, maxY: 14, cellChance: 0.1, radius: 1.6, density: 0.55 }
];
