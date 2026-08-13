// Chunk streaming: loads chunks around the player with a per-frame time
// budget, meshes them once neighbors exist, remeshes dirty chunks, and
// unloads distant ones.

import * as THREE from 'three';
import { CHUNK_SIZE } from '../core/constants.js';
import { ChunkState, chunkKey } from './Chunk.js';
import { computeChunkLight } from './Lighting.js';
import { buildChunkGeometry, getChunkMaterials } from './Mesher.js';

const GEN_BUDGET_MS = 6;   // per-frame terrain generation budget
const MESH_BUDGET_MS = 6;  // per-frame meshing budget

export class ChunkManager {
  constructor(world, scene, renderDistance = 6) {
    this.world = world;
    this.scene = scene;
    this.renderDistance = renderDistance;
    this.dirtyQueue = new Set();
    world.onChunkDirty = (chunk) => this.dirtyQueue.add(chunkKey(chunk.cx, chunk.cz));
    this.centerCX = 0;
    this.centerCZ = 0;
  }

  setRenderDistance(d) {
    this.renderDistance = Math.max(2, Math.min(16, d | 0));
  }

  // Main per-frame update. playerPos is world-space.
  update(playerPos) {
    const pcx = Math.floor(playerPos.x / CHUNK_SIZE);
    const pcz = Math.floor(playerPos.z / CHUNK_SIZE);
    this.centerCX = pcx;
    this.centerCZ = pcz;

    this.generateAround(pcx, pcz);
    this.meshAround(pcx, pcz);
    this.remeshDirty();
    this.unloadFar(pcx, pcz);
  }

  // Generate terrain for missing chunks, nearest-first, within budget.
  generateAround(pcx, pcz) {
    const start = performance.now();
    const R = this.renderDistance + 1; // one ring beyond render distance for meshing neighbors
    for (let r = 0; r <= R; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const cx = pcx + dx, cz = pcz + dz;
          if (this.world.getChunk(cx, cz)) continue;
          this.world.ensureChunk(cx, cz);
          if (performance.now() - start > GEN_BUDGET_MS) return;
        }
      }
    }
  }

  // Mesh generated chunks whose 4 neighbors are generated, nearest-first.
  meshAround(pcx, pcz) {
    const start = performance.now();
    for (let r = 0; r <= this.renderDistance; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const cx = pcx + dx, cz = pcz + dz;
          const chunk = this.world.getChunk(cx, cz);
          if (!chunk || chunk.state !== ChunkState.GENERATED) continue;
          if (!this.neighborsGenerated(cx, cz)) continue;
          this.lightAndMesh(chunk);
          if (performance.now() - start > MESH_BUDGET_MS) return;
        }
      }
    }
  }

  neighborsGenerated(cx, cz) {
    return this.world.getChunk(cx - 1, cz) && this.world.getChunk(cx + 1, cz) &&
           this.world.getChunk(cx, cz - 1) && this.world.getChunk(cx, cz + 1);
  }

  lightAndMesh(chunk) {
    computeChunkLight(this.world, chunk);
    this.buildMesh(chunk);
    chunk.state = ChunkState.MESHED;
    chunk.dirty = false;
  }

  buildMesh(chunk) {
    this.disposeMeshes(chunk);
    const geos = buildChunkGeometry(this.world, chunk);
    const mats = getChunkMaterials();
    const meshes = {};
    const baseX = chunk.cx * CHUNK_SIZE, baseZ = chunk.cz * CHUNK_SIZE;
    if (geos.opaque) {
      meshes.opaque = new THREE.Mesh(geos.opaque, mats.opaque);
      meshes.opaque.position.set(baseX, 0, baseZ);
      meshes.opaque.matrixAutoUpdate = false;
      meshes.opaque.updateMatrix();
      this.scene.add(meshes.opaque);
    }
    if (geos.water) {
      meshes.water = new THREE.Mesh(geos.water, mats.water);
      meshes.water.position.set(baseX, 0, baseZ);
      meshes.water.matrixAutoUpdate = false;
      meshes.water.updateMatrix();
      meshes.water.renderOrder = 2;
      this.scene.add(meshes.water);
    }
    chunk.meshes = meshes;
  }

  disposeMeshes(chunk) {
    if (!chunk.meshes) return;
    for (const key of ['opaque', 'water']) {
      const m = chunk.meshes[key];
      if (m) {
        this.scene.remove(m);
        m.geometry.dispose();
      }
    }
    chunk.meshes = null;
  }

  // Remesh chunks marked dirty by block edits (relight first).
  remeshDirty() {
    if (!this.dirtyQueue.size) return;
    const start = performance.now();
    for (const key of this.dirtyQueue) {
      const chunk = this.world.chunks.get(key);
      this.dirtyQueue.delete(key);
      if (!chunk) continue;
      if (chunk.state === ChunkState.MESHED || chunk.dirty) {
        computeChunkLight(this.world, chunk);
        this.buildMesh(chunk);
        chunk.state = ChunkState.MESHED;
        chunk.dirty = false;
      }
      if (performance.now() - start > 8) return; // rest next frame
    }
  }

  unloadFar(pcx, pcz) {
    const limit = this.renderDistance + 3;
    for (const [key, chunk] of this.world.chunks) {
      const d = Math.max(Math.abs(chunk.cx - pcx), Math.abs(chunk.cz - pcz));
      if (d > limit) {
        this.disposeMeshes(chunk);
        this.world.unloadChunk(key);
        this.dirtyQueue.delete(key);
      }
    }
  }

  // Force-remesh everything (e.g. after render distance change) — cheap lazily:
  markAllDirty() {
    for (const [key, chunk] of this.world.chunks) {
      if (chunk.state === ChunkState.MESHED) this.dirtyQueue.add(key);
    }
  }

  // Count for debug HUD
  get loadedCount() {
    return this.world.chunks.size;
  }
}
