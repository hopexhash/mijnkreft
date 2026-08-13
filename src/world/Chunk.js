// A 16 x WORLD_HEIGHT x 16 column of blocks.

import { CHUNK_SIZE, WORLD_HEIGHT } from '../core/constants.js';

export const ChunkState = Object.freeze({
  EMPTY: 0,
  GENERATED: 1, // terrain + decorations placed
  MESHED: 2     // lit and meshed
});

export function blockIndex(x, y, z) {
  // x,z in [0,16), y in [0,WORLD_HEIGHT)
  return x | (z << 4) | (y << 8);
}

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    // packed light: high nibble = sunlight, low nibble = blocklight
    this.light = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    this.state = ChunkState.EMPTY;
    this.dirty = false;          // needs remesh
    this.edits = new Map();      // idx -> blockId (player modifications, for saving)
    this.meshes = null;          // { opaque, transparent } THREE.Mesh
    this.heightMap = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE); // highest non-air, for spawning/sky checks
  }

  get(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) return 0;
    return this.blocks[blockIndex(x, y, z)];
  }

  set(x, y, z, id) {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    this.blocks[blockIndex(x, y, z)] = id;
  }

  // Record a player edit (kept separately so saves only store diffs)
  recordEdit(x, y, z, id) {
    this.edits.set(blockIndex(x, y, z), id);
  }

  getSun(x, y, z) {
    if (y >= WORLD_HEIGHT) return 15;
    if (y < 0) return 0;
    return this.light[blockIndex(x, y, z)] >> 4;
  }

  getBlockLight(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) return 0;
    return this.light[blockIndex(x, y, z)] & 15;
  }

  setLight(x, y, z, sun, block) {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    this.light[blockIndex(x, y, z)] = ((sun & 15) << 4) | (block & 15);
  }

  computeHeightMap() {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        let h = 0;
        for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
          if (this.blocks[blockIndex(x, y, z)] !== 0) { h = y; break; }
        }
        this.heightMap[x | (z << 4)] = h;
      }
    }
  }
}

export function chunkKey(cx, cz) {
  return cx + ',' + cz;
}
