// World persistence. Saves are compact diffs: the terrain regenerates from
// the seed, and only player edits, containers, entities-adjacent state,
// player status and time are stored. Uses localStorage with JSON.

const INDEX_KEY = 'kreft.worlds.v1';
const WORLD_PREFIX = 'kreft.world.v1.';

export class SaveManager {
  // --- World index ---
  listWorlds() {
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  saveIndex(list) {
    try {
      localStorage.setItem(INDEX_KEY, JSON.stringify(list));
    } catch { /* quota */ }
  }

  createWorldEntry(name, seed, mode) {
    const list = this.listWorlds();
    const id = 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    list.unshift({ id, name, seed: String(seed), mode, created: Date.now(), lastPlayed: Date.now() });
    this.saveIndex(list);
    return id;
  }

  touchWorld(id) {
    const list = this.listWorlds();
    const entry = list.find(w => w.id === id);
    if (entry) {
      entry.lastPlayed = Date.now();
      this.saveIndex(list);
    }
  }

  deleteWorld(id) {
    const list = this.listWorlds().filter(w => w.id !== id);
    this.saveIndex(list);
    try {
      localStorage.removeItem(WORLD_PREFIX + id);
    } catch { /* ignore */ }
  }

  getWorldEntry(id) {
    return this.listWorlds().find(w => w.id === id) || null;
  }

  // --- World data ---
  // game → serializable snapshot
  saveWorld(id, game) {
    const world = game.world;

    // merge loaded-chunk edits into the stored edit map
    const edits = {};
    for (const [key, map] of world.storedEdits) {
      if (map.size) edits[key] = [...map.entries()];
    }
    for (const [key, chunk] of world.chunks) {
      if (chunk.edits.size) edits[key] = [...chunk.edits.entries()];
    }

    const containers = {};
    for (const [key, c] of world.containers) {
      containers[key] = c;
    }

    const data = {
      version: 1,
      seed: String(game.seed),
      mode: game.mode,
      time: game.sky.time,
      player: {
        x: game.player.position.x,
        y: game.player.position.y,
        z: game.player.position.z,
        yaw: game.player.yaw,
        pitch: game.player.pitch,
        flying: game.player.flying,
        spawn: game.spawnPoint
      },
      stats: game.stats.serialize(),
      inventory: game.inventory.serialize(),
      edits,
      containers
    };

    try {
      localStorage.setItem(WORLD_PREFIX + id, JSON.stringify(data));
      this.touchWorld(id);
      return true;
    } catch (err) {
      console.error('World save failed (storage quota?)', err);
      return false;
    }
  }

  loadWorld(id) {
    try {
      const raw = localStorage.getItem(WORLD_PREFIX + id);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== 1) return null;
      return data;
    } catch {
      return null;
    }
  }

  // Restore edit maps into a World instance.
  applyWorldData(world, data) {
    if (data.edits) {
      for (const [key, entries] of Object.entries(data.edits)) {
        world.storedEdits.set(key, new Map(entries.map(([i, v]) => [Number(i), v])));
      }
    }
    if (data.containers) {
      for (const [key, c] of Object.entries(data.containers)) {
        world.containers.set(key, c);
      }
    }
  }
}
