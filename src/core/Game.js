// Game: owns the renderer, world, player, entities, sky, audio and the
// main loop for a single play session. Created per world, disposed on exit.

import * as THREE from 'three';
import { GameMode, CHUNK_SIZE, MAX_HEALTH, SEA_LEVEL } from './constants.js';
import { World } from '../world/World.js';
import { ChunkManager } from '../world/ChunkManager.js';
import { updateChunkMaterials } from '../world/Mesher.js';
import { getBlock, B } from '../world/BlockRegistry.js';
import { BIOME_DEFS } from '../world/Biomes.js';
import { PlayerController } from '../player/PlayerController.js';
import { PlayerStats } from '../player/PlayerStats.js';
import { Interaction } from '../player/Interaction.js';
import { Inventory } from '../inventory/Inventory.js';
import { CraftingSystem } from '../crafting/CraftingSystem.js';
import { EntityManager } from '../entities/EntityManager.js';
import { Sky } from '../sky/Sky.js';
import { getItem } from '../world/ItemRegistry.js';
import { SMELT_TIME } from '../crafting/recipes.js';

export class Game {
  constructor({ renderer, input, settings, audio, ui, saveManager, worldId, worldData, entry }) {
    this.renderer = renderer;
    this.input = input;
    this.settings = settings;
    this.audio = audio;
    this.ui = ui;
    this.saveManager = saveManager;
    this.worldId = worldId;

    this.seed = worldData?.seed ?? entry.seed;
    this.mode = worldData?.mode ?? entry.mode ?? GameMode.SURVIVAL;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.get('fov'), innerWidth / innerHeight, 0.08, 900);

    this.world = new World(this.seed);
    if (worldData) saveManager.applyWorldData(this.world, worldData);

    this.chunkManager = new ChunkManager(this.world, this.scene, settings.get('renderDistance'));
    this.sky = new Sky(this.scene, settings.get('dayLength'));
    if (worldData?.time !== undefined) this.sky.time = worldData.time;

    this.player = new PlayerController(this.world, this.camera, input, settings);
    this.player.gameMode = this.mode;
    this.stats = new PlayerStats();
    this.inventory = new Inventory();
    this.crafting = new CraftingSystem();
    this.entities = new EntityManager(this.world, this.scene);
    this.interaction = new Interaction(this);

    this.paused = false;
    this.elapsed = 0;
    this.autosaveTimer = 0;
    this.caveAmbientTimer = 10;

    // spawn point + restore player
    if (worldData?.player) {
      const p = worldData.player;
      this.spawnPoint = p.spawn || { x: p.x, y: p.y, z: p.z };
      this.player.teleport(p.x, p.y, p.z);
      this.player.yaw = p.yaw || 0;
      this.player.pitch = p.pitch || 0;
      this.player.flying = !!p.flying && this.mode === GameMode.CREATIVE;
      this.stats.deserialize(worldData.stats);
      this.inventory.deserialize(worldData.inventory);
    } else {
      const spawn = this.world.generator.findSpawn();
      this.spawnPoint = spawn;
      this.player.teleport(spawn.x, spawn.y, spawn.z);
    }

    // stat callbacks
    this.stats.onDamage = (amount, cause) => {
      this.audio.play('hurt');
      this.ui.damageFlash();
    };
    this.stats.onDeath = (cause) => this.onDeath(cause);
    this.player.onFall = (dist) => {
      if (this.mode === GameMode.SURVIVAL) {
        this.stats.damage(Math.floor(dist - 3), 'fall', true);
      }
    };
    this.player.stepCallback = () => this.audio.play('step');

    // creative flight: double-tap space
    this.input.onDoublePress('Space', () => {
      if (this.mode === GameMode.CREATIVE && !this.ui.anyModalOpen()) {
        this.player.flying = !this.player.flying;
      }
    });

    // settings hooks
    settings.onChange('renderDistance', d => this.chunkManager.setRenderDistance(d));
    settings.onChange('dayLength', d => { this.sky.dayLength = d; });
    settings.onChange('fov', () => { /* applied by controller */ });

    // pre-generate spawn area synchronously enough to stand on
    this.warmup();
  }

  warmup() {
    const pcx = Math.floor(this.player.position.x / CHUNK_SIZE);
    const pcz = Math.floor(this.player.position.z / CHUNK_SIZE);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        this.world.ensureChunk(pcx + dx, pcz + dz);
      }
    }
    // snap player onto ground
    const p = this.player.position;
    let y = Math.floor(p.y);
    while (y > 1 && !this.world.getBlockDef(Math.floor(p.x), y - 1, Math.floor(p.z)).solid) y--;
    while (this.world.getBlockDef(Math.floor(p.x), y, Math.floor(p.z)).solid) y++;
    p.y = y + 0.02;
  }

  // Damage routed from creatures / explosions
  damagePlayer(amount, cause, fromPos) {
    if (this.mode === GameMode.CREATIVE) return;
    const took = this.stats.damage(amount, cause);
    if (took && fromPos) {
      const away = this.player.position.clone().sub(fromPos).setY(0).normalize();
      this.player.velocity.x += away.x * 6;
      this.player.velocity.z += away.z * 6;
      this.player.velocity.y = Math.max(this.player.velocity.y, 5);
    }
  }

  explode(center, radius, damage) {
    this.audio.play('explosion');
    this.ui.shake();
    // destroy blocks
    const r = Math.ceil(radius);
    for (let dy = -r; dy <= r; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d > radius) continue;
          const x = Math.floor(center.x + dx), y = Math.floor(center.y + dy), z = Math.floor(center.z + dz);
          const def = this.world.getBlockDef(x, y, z);
          if (def.id === B.AIR || def.hardness < 0 || def.liquid) continue;
          // hard blocks resist the edge of the blast
          if (def.hardness > 2.5 && d > radius * 0.7) continue;
          this.world.setBlock(x, y, z, B.AIR);
        }
      }
    }
    // damage player
    const pd = this.player.position.clone().setY(this.player.position.y + 0.9).distanceTo(center);
    if (pd < radius * 2.2) {
      const dmg = Math.round(damage * Math.max(0, 1 - pd / (radius * 2.2)));
      if (dmg > 0) this.damagePlayer(dmg, 'explosion', center);
    }
    // damage nearby creatures
    for (const c of this.entities.creaturesNear(center, radius * 2)) {
      const d = c.pos.distanceTo(center);
      const dmg = Math.round(damage * Math.max(0, 1 - d / (radius * 2)));
      if (dmg > 0) {
        const knock = c.pos.clone().sub(center).setY(0).normalize();
        c.hurt(dmg, knock, this);
      }
    }
  }

  onDeath(cause) {
    this.audio.play('death');
    // drop inventory
    if (this.mode === GameMode.SURVIVAL) {
      const p = this.player.position;
      for (const stack of this.inventory.drainAll()) {
        this.entities.spawnDrop(stack.name, stack.count, p.x, p.y + 1, p.z, true, stack.durability);
      }
    }
    this.ui.showDeathScreen(cause);
  }

  respawn() {
    this.stats.reset();
    this.player.teleport(this.spawnPoint.x, this.spawnPoint.y + 1, this.spawnPoint.z);
    this.player.flying = false;
    this.warmup();
    this.ui.hideDeathScreen();
    this.ui.refreshHotbar();
  }

  save() {
    return this.saveManager.saveWorld(this.worldId, this);
  }

  // --- Furnace simulation (runs for all placed furnaces with state) ---
  updateFurnaces(dt) {
    for (const [key, c] of this.world.containers) {
      if (c.type !== 'furnace') continue;
      const inputItem = c.input ? getItem(c.input.name) : null;
      const canSmelt = inputItem?.smelt &&
        (!c.output || (c.output.name === inputItem.smelt && c.output.count < getItem(inputItem.smelt).stack));

      // consume fuel when needed
      if (c.burnLeft <= 0 && canSmelt && c.fuel) {
        const fuelItem = getItem(c.fuel.name);
        if (fuelItem?.fuel) {
          c.burnLeft = fuelItem.fuel;
          c.burnTotal = fuelItem.fuel;
          c.fuel.count--;
          if (c.fuel.count <= 0) c.fuel = null;
        }
      }

      if (c.burnLeft > 0) {
        c.burnLeft -= dt;
        if (canSmelt) {
          c.progress += dt;
          if (c.progress >= SMELT_TIME) {
            c.progress = 0;
            const outName = inputItem.smelt;
            if (c.output) c.output.count++;
            else c.output = { name: outName, count: 1 };
            c.input.count--;
            if (c.input.count <= 0) c.input = null;
            this.audio.play('smelt_done');
            this.ui.refreshOpenContainer();
          }
        } else {
          c.progress = 0;
        }
      } else {
        c.progress = Math.max(0, c.progress - dt * 2);
        c.burnLeft = 0;
      }
    }
  }

  update(dt) {
    if (this.paused) return;
    this.elapsed += dt;

    const modalOpen = this.ui.anyModalOpen();

    // world streaming
    this.chunkManager.update(this.player.position);

    // player (skip movement input while modal open, but keep physics)
    if (!this.stats.dead) {
      if (modalOpen) {
        this.input.keys.clear?.();
      }
      this.player.update(dt);
      if (!modalOpen) this.interaction.update(dt);
    }

    // water entry splash
    const nowInWater = this.player.inWater;
    if (nowInWater && !this.wasInWater) this.audio.play('splash');
    this.wasInWater = nowInWater;

    // stats
    const moving = Math.hypot(this.player.velocity.x, this.player.velocity.z) > 0.5;
    this.stats.update(dt, {
      sprinting: this.player.sprinting,
      moving,
      headInWater: this.player.headInWater,
      gameMode: this.mode
    });

    // entities, furnaces
    this.entities.update(dt, this);
    this.updateFurnaces(dt);

    // sky + fog + materials
    const biome = this.world.generator.biomeAt(Math.floor(this.player.position.x), Math.floor(this.player.position.z));
    const tint = BIOME_DEFS[biome].fogTint;
    this.sky.update(dt, this.camera.position, tint);

    const rd = this.settings.get('renderDistance') * CHUNK_SIZE;
    const underwater = this.player.headInWater;
    const fogNear = underwater ? 2 : Math.max(16, rd - 24);
    const fogFar = underwater ? 18 : rd - 2;
    const fogColor = underwater ? { r: 0.08, g: 0.2, b: 0.4 } : this.sky.fogColor;
    updateChunkMaterials({
      sun: Math.max(0.06, this.sky.sunFactor),
      fogColor, fogNear, fogFar,
      time: this.elapsed
    });
    this.renderer.setClearColor(new THREE.Color(fogColor.r, fogColor.g, fogColor.b));

    // ambient cave sounds
    this.caveAmbientTimer -= dt;
    if (this.caveAmbientTimer <= 0) {
      this.caveAmbientTimer = 20 + Math.random() * 30;
      const sun = this.world.getSunAt(Math.floor(this.player.position.x), Math.floor(this.player.position.y + 1), Math.floor(this.player.position.z));
      if (sun < 3 && this.player.position.y < SEA_LEVEL - 10) this.audio.play('ambient_cave');
    }

    // autosave every 20s
    this.autosaveTimer += dt;
    if (this.autosaveTimer > 20) {
      this.autosaveTimer = 0;
      this.save();
    }

    // HUD
    this.ui.updateHUD(dt);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.save();
    this.entities.clear();
    for (const [key, chunk] of this.world.chunks) {
      this.chunkManager.disposeMeshes(chunk);
    }
    this.scene.clear();
  }
}
