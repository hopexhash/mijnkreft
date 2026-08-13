// World: global block access across chunks, block edits, raycasting,
// container (chest/furnace) state, and persistence bookkeeping.

import { CHUNK_SIZE, WORLD_HEIGHT } from '../core/constants.js';
import { Chunk, ChunkState, chunkKey, blockIndex } from './Chunk.js';
import { getBlock, B } from './BlockRegistry.js';
import { WorldGenerator } from './WorldGenerator.js';

export class World {
  constructor(seed) {
    this.generator = new WorldGenerator(seed);
    this.chunks = new Map();          // chunkKey -> Chunk (loaded)
    this.storedEdits = new Map();     // chunkKey -> Map(idx -> blockId) — survives unload
    this.containers = new Map();      // "x,y,z" -> container data (chest slots / furnace state)
    this.onChunkDirty = null;         // callback(chunk) set by ChunkManager
  }

  getChunk(cx, cz) {
    return this.chunks.get(chunkKey(cx, cz)) || null;
  }

  getChunkAt(wx, wz) {
    return this.getChunk(Math.floor(wx / CHUNK_SIZE), Math.floor(wz / CHUNK_SIZE));
  }

  // Create + generate a chunk (applies stored edits)
  ensureChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (chunk) return chunk;
    chunk = new Chunk(cx, cz);
    this.chunks.set(key, chunk);
    this.generator.generate(chunk);
    // re-apply saved player edits
    const edits = this.storedEdits.get(key);
    if (edits) {
      for (const [idx, id] of edits) {
        chunk.blocks[idx] = id;
        chunk.edits.set(idx, id);
      }
      chunk.computeHeightMap();
    }
    chunk.state = ChunkState.GENERATED;
    return chunk;
  }

  unloadChunk(key) {
    const chunk = this.chunks.get(key);
    if (!chunk) return null;
    if (chunk.edits.size) this.storedEdits.set(key, chunk.edits);
    this.chunks.delete(key);
    return chunk;
  }

  getBlockId(wx, wy, wz) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return B.AIR;
    const chunk = this.getChunkAt(wx, wz);
    if (!chunk) return B.AIR;
    return chunk.get(((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE, wy, ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE);
  }

  getBlockDef(wx, wy, wz) {
    return getBlock(this.getBlockId(wx, wy, wz));
  }

  isSolid(wx, wy, wz) {
    return this.getBlockDef(Math.floor(wx), Math.floor(wy), Math.floor(wz)).solid;
  }

  isLiquid(wx, wy, wz) {
    return this.getBlockDef(Math.floor(wx), Math.floor(wy), Math.floor(wz)).liquid;
  }

  getSunAt(wx, wy, wz) {
    if (wy >= WORLD_HEIGHT) return 15;
    if (wy < 0) return 0;
    const chunk = this.getChunkAt(wx, wz);
    if (!chunk || chunk.state < ChunkState.GENERATED) return 0;
    return chunk.getSun(((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE, wy, ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE);
  }

  getBlockLightAt(wx, wy, wz) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return 0;
    const chunk = this.getChunkAt(wx, wz);
    if (!chunk) return 0;
    return chunk.getBlockLight(((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE, wy, ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE);
  }

  // Combined light 0..15 given current sun level factor 0..1 (day/night)
  lightAt(wx, wy, wz, sunFactor) {
    const sun = this.getSunAt(Math.floor(wx), Math.floor(wy), Math.floor(wz));
    const bl = this.getBlockLightAt(Math.floor(wx), Math.floor(wy), Math.floor(wz));
    return Math.max(bl, sun * sunFactor);
  }

  // Set a block (player edit). Marks affected chunks dirty for relight+remesh.
  setBlock(wx, wy, wz, id, recordEdit = true) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return false;
    const chunk = this.getChunkAt(wx, wz);
    if (!chunk) return false;
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const old = chunk.get(lx, wy, lz);
    if (old === id) return false;
    chunk.set(lx, wy, lz, id);
    if (recordEdit) chunk.recordEdit(lx, wy, lz, id);
    chunk.computeHeightMap();

    // container cleanup when its block is removed
    if (id === B.AIR) this.containers.delete(`${wx},${wy},${wz}`);

    // gravity blocks above may fall
    this.applyGravity(wx, wy + 1, wz);

    this.markDirtyAround(wx, wy, wz);
    return true;
  }

  // Sand/gravel falls when support is removed.
  applyGravity(wx, wy, wz) {
    const def = this.getBlockDef(wx, wy, wz);
    if (!def.gravity) return;
    let fallTo = wy;
    while (fallTo > 1 && !this.getBlockDef(wx, fallTo - 1, wz).solid && !this.getBlockDef(wx, fallTo - 1, wz).liquid) fallTo--;
    if (fallTo !== wy) {
      this.setBlock(wx, wy, wz, B.AIR);
      this.setBlock(wx, fallTo, wz, def.id);
    }
  }

  // Mark the chunk containing (wx,wz) — and neighbors if near a border — dirty.
  markDirtyAround(wx, wy, wz) {
    const cx = Math.floor(wx / CHUNK_SIZE), cz = Math.floor(wz / CHUNK_SIZE);
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const marks = new Set([chunkKey(cx, cz)]);
    // torch light can travel up to 14 blocks: relight neighbors too when near border
    const reach = 14;
    if (lx < reach) marks.add(chunkKey(cx - 1, cz));
    if (lx >= CHUNK_SIZE - reach) marks.add(chunkKey(cx + 1, cz));
    if (lz < reach) marks.add(chunkKey(cx, cz - 1));
    if (lz >= CHUNK_SIZE - reach) marks.add(chunkKey(cx, cz + 1));
    if (lx < reach && lz < reach) marks.add(chunkKey(cx - 1, cz - 1));
    if (lx < reach && lz >= CHUNK_SIZE - reach) marks.add(chunkKey(cx - 1, cz + 1));
    if (lx >= CHUNK_SIZE - reach && lz < reach) marks.add(chunkKey(cx + 1, cz - 1));
    if (lx >= CHUNK_SIZE - reach && lz >= CHUNK_SIZE - reach) marks.add(chunkKey(cx + 1, cz + 1));
    for (const key of marks) {
      const c = this.chunks.get(key);
      if (c && c.state >= ChunkState.GENERATED) {
        c.dirty = true;
        if (this.onChunkDirty) this.onChunkDirty(c);
      }
    }
  }

  // --- Containers (chests, furnaces) ---
  getContainer(wx, wy, wz, type) {
    const key = `${wx},${wy},${wz}`;
    let c = this.containers.get(key);
    if (!c) {
      if (type === 'chest') {
        c = { type: 'chest', slots: new Array(27).fill(null) };
      } else if (type === 'furnace') {
        c = { type: 'furnace', input: null, fuel: null, output: null, burnLeft: 0, burnTotal: 0, progress: 0 };
      }
      this.containers.set(key, c);
    }
    return c;
  }

  // --- Voxel raycast (Amanatides & Woo DDA) ---
  // Returns { x, y, z, face: [nx,ny,nz], id } or null.
  raycast(origin, dir, maxDist, hitLiquid = false) {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const stepX = Math.sign(dir.x), stepY = Math.sign(dir.y), stepZ = Math.sign(dir.z);
    const tDeltaX = stepX !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dir.z) : Infinity;
    let tMaxX = stepX > 0 ? (x + 1 - origin.x) * tDeltaX : stepX < 0 ? (origin.x - x) * tDeltaX : Infinity;
    let tMaxY = stepY > 0 ? (y + 1 - origin.y) * tDeltaY : stepY < 0 ? (origin.y - y) * tDeltaY : Infinity;
    let tMaxZ = stepZ > 0 ? (z + 1 - origin.z) * tDeltaZ : stepZ < 0 ? (origin.z - z) * tDeltaZ : Infinity;
    let face = [0, 0, 0];
    let t = 0;

    while (t <= maxDist) {
      const id = this.getBlockId(x, y, z);
      if (id !== B.AIR) {
        const def = getBlock(id);
        if (def.liquid ? hitLiquid : true) {
          return { x, y, z, face, id, dist: t };
        }
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; t = tMaxX; tMaxX += tDeltaX; face = [-stepX, 0, 0];
      } else if (tMaxY < tMaxZ) {
        y += stepY; t = tMaxY; tMaxY += tDeltaY; face = [0, -stepY, 0];
      } else {
        z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; face = [0, 0, -stepZ];
      }
    }
    return null;
  }

  // Surface height at world column (for spawning creatures etc.)
  surfaceHeight(wx, wz) {
    const chunk = this.getChunkAt(wx, wz);
    if (!chunk) return this.generator.height(wx, wz);
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return chunk.heightMap[lx | (lz << 4)];
  }
}
