// Classic voxel lighting: sunlight columns + BFS flood fill for both
// sunlight lateral spread and emissive block light.
// Lighting is computed per chunk, seeding from already-lit neighbors.

import { CHUNK_SIZE, WORLD_HEIGHT } from '../core/constants.js';
import { getBlock } from './BlockRegistry.js';
import { blockIndex } from './Chunk.js';

// Reusable BFS queue (x, y, z, level packed)
const queue = new Int32Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT * 4);

export function computeChunkLight(world, chunk) {
  const blocks = chunk.blocks;
  const light = chunk.light;
  light.fill(0);

  let qh = 0, qt = 0;
  const push = (x, y, z, lv) => {
    queue[qt++] = x; queue[qt++] = y; queue[qt++] = z; queue[qt++] = lv;
  };

  // --- Sunlight: vertical pass ---
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      let lv = 15;
      for (let y = WORLD_HEIGHT - 1; y >= 0 && lv > 0; y--) {
        const idx = blockIndex(x, y, z);
        const op = getBlock(blocks[idx]).opacity;
        if (op >= 15) break;
        lv = Math.max(0, lv - op);
        if (lv > 0) {
          light[idx] = lv << 4;
          if (lv > 1) push(x, y, z, lv);
        }
      }
    }
  }

  // --- Seed sunlight from neighbor chunk borders ---
  // For each border cell, check the adjacent out-of-chunk cell's sun value.
  const baseX = chunk.cx * CHUNK_SIZE, baseZ = chunk.cz * CHUNK_SIZE;
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let i = 0; i < CHUNK_SIZE; i++) {
      // -X border
      let s = world.getSunAt(baseX - 1, y, baseZ + i);
      if (s > 1) trySeedSun(chunk, 0, y, i, s - 1, push);
      // +X border
      s = world.getSunAt(baseX + CHUNK_SIZE, y, baseZ + i);
      if (s > 1) trySeedSun(chunk, CHUNK_SIZE - 1, y, i, s - 1, push);
      // -Z border
      s = world.getSunAt(baseX + i, y, baseZ - 1);
      if (s > 1) trySeedSun(chunk, i, y, 0, s - 1, push);
      // +Z border
      s = world.getSunAt(baseX + i, y, baseZ + CHUNK_SIZE);
      if (s > 1) trySeedSun(chunk, i, y, CHUNK_SIZE - 1, s - 1, push);
    }
  }

  // --- Sunlight BFS (lateral + downward spread into caves/overhangs) ---
  while (qh < qt) {
    const x = queue[qh++], y = queue[qh++], z = queue[qh++], lv = queue[qh++];
    const idx = blockIndex(x, y, z);
    const cur = light[idx] >> 4;
    if (cur > lv) continue; // stale entry
    spreadSun(chunk, blocks, light, x - 1, y, z, lv, push);
    spreadSun(chunk, blocks, light, x + 1, y, z, lv, push);
    spreadSun(chunk, blocks, light, x, y - 1, z, lv, push);
    spreadSun(chunk, blocks, light, x, y + 1, z, lv, push);
    spreadSun(chunk, blocks, light, x, y, z - 1, lv, push);
    spreadSun(chunk, blocks, light, x, y, z + 1, lv, push);
  }

  // --- Block light: seed from emitters in this chunk ---
  qh = 0; qt = 0;
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const idx = blockIndex(x, y, z);
        const emit = getBlock(blocks[idx]).lightEmit;
        if (emit > 0) {
          light[idx] = (light[idx] & 0xF0) | emit;
          push(x, y, z, emit);
        }
      }
    }
  }
  // seed from neighbor borders
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let i = 0; i < CHUNK_SIZE; i++) {
      let s = world.getBlockLightAt(baseX - 1, y, baseZ + i);
      if (s > 1) trySeedBlockLight(chunk, 0, y, i, s - 1, push);
      s = world.getBlockLightAt(baseX + CHUNK_SIZE, y, baseZ + i);
      if (s > 1) trySeedBlockLight(chunk, CHUNK_SIZE - 1, y, i, s - 1, push);
      s = world.getBlockLightAt(baseX + i, y, baseZ - 1);
      if (s > 1) trySeedBlockLight(chunk, i, y, 0, s - 1, push);
      s = world.getBlockLightAt(baseX + i, y, baseZ + CHUNK_SIZE);
      if (s > 1) trySeedBlockLight(chunk, i, y, CHUNK_SIZE - 1, s - 1, push);
    }
  }

  while (qh < qt) {
    const x = queue[qh++], y = queue[qh++], z = queue[qh++], lv = queue[qh++];
    const idx = blockIndex(x, y, z);
    const cur = light[idx] & 15;
    if (cur > lv) continue;
    spreadBlock(chunk, blocks, light, x - 1, y, z, lv, push);
    spreadBlock(chunk, blocks, light, x + 1, y, z, lv, push);
    spreadBlock(chunk, blocks, light, x, y - 1, z, lv, push);
    spreadBlock(chunk, blocks, light, x, y + 1, z, lv, push);
    spreadBlock(chunk, blocks, light, x, y, z - 1, lv, push);
    spreadBlock(chunk, blocks, light, x, y, z + 1, lv, push);
  }
}

function trySeedSun(chunk, x, y, z, lv, push) {
  const idx = blockIndex(x, y, z);
  const op = getBlock(chunk.blocks[idx]).opacity;
  const nl = Math.max(0, lv - op);
  if (nl > (chunk.light[idx] >> 4)) {
    chunk.light[idx] = (chunk.light[idx] & 0x0F) | (nl << 4);
    if (nl > 1) push(x, y, z, nl);
  }
}

function trySeedBlockLight(chunk, x, y, z, lv, push) {
  const idx = blockIndex(x, y, z);
  const op = getBlock(chunk.blocks[idx]).opacity;
  const nl = Math.max(0, lv - op);
  if (nl > (chunk.light[idx] & 15)) {
    chunk.light[idx] = (chunk.light[idx] & 0xF0) | nl;
    if (nl > 1) push(x, y, z, nl);
  }
}

function spreadSun(chunk, blocks, light, x, y, z, lv, push) {
  if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return;
  const idx = blockIndex(x, y, z);
  const op = getBlock(blocks[idx]).opacity;
  if (op >= 15) return;
  const nl = Math.max(0, lv - 1 - op);
  if (nl > (light[idx] >> 4)) {
    light[idx] = (light[idx] & 0x0F) | (nl << 4);
    if (nl > 1) push(x, y, z, nl);
  }
}

function spreadBlock(chunk, blocks, light, x, y, z, lv, push) {
  if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return;
  const idx = blockIndex(x, y, z);
  const op = getBlock(blocks[idx]).opacity;
  if (op >= 15) return;
  const nl = Math.max(0, lv - 1 - op);
  if (nl > (light[idx] & 15)) {
    light[idx] = (light[idx] & 0xF0) | nl;
    if (nl > 1) push(x, y, z, nl);
  }
}
