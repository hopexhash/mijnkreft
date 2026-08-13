// Entities: dropped items and creatures (AI, physics, combat, spawning).

import * as THREE from 'three';
import { CREATURE_DEFS } from './CreatureDefs.js';
import { getItem, itemTileKey } from '../world/ItemRegistry.js';
import { getBlock, B } from '../world/BlockRegistry.js';
import { tileUV, getAtlasTexture } from '../gfx/TextureAtlas.js';
import { GRAVITY, GameMode, SEA_LEVEL } from '../core/constants.js';
import { BIOME_DEFS } from '../world/Biomes.js';

const _v = new THREE.Vector3();

// Simple voxel AABB collision for entities.
function entityCollides(world, x, y, z, halfW, height) {
  const minX = Math.floor(x - halfW), maxX = Math.floor(x + halfW);
  const minY = Math.floor(y), maxY = Math.floor(y + height - 0.02);
  const minZ = Math.floor(z - halfW), maxZ = Math.floor(z + halfW);
  for (let by = minY; by <= maxY; by++) {
    if (by < 0) return true;
    for (let bz = minZ; bz <= maxZ; bz++) {
      for (let bx = minX; bx <= maxX; bx++) {
        if (world.getBlockDef(bx, by, bz).solid) return true;
      }
    }
  }
  return false;
}

function moveEntity(world, ent, dt) {
  const halfW = ent.width / 2;
  const move = (axis, amount) => {
    if (!amount) return;
    const step = 0.2;
    let rest = amount;
    while (Math.abs(rest) > 1e-9) {
      const s = Math.abs(rest) > step ? Math.sign(rest) * step : rest;
      const nx = axis === 'x' ? ent.pos.x + s : ent.pos.x;
      const ny = axis === 'y' ? ent.pos.y + s : ent.pos.y;
      const nz = axis === 'z' ? ent.pos.z + s : ent.pos.z;
      if (!entityCollides(world, nx, ny, nz, halfW, ent.height)) {
        ent.pos.set(nx, ny, nz);
      } else {
        if (axis === 'y') {
          if (s < 0) ent.onGround = true;
          ent.vel.y = 0;
        } else {
          // creatures auto-jump one block
          if (ent.canJump && ent.onGround) {
            const upY = ent.pos.y + 1.05;
            if (!entityCollides(world, nx, upY, nz, halfW, ent.height) &&
                !entityCollides(world, ent.pos.x, upY, ent.pos.z, halfW, ent.height)) {
              ent.vel.y = 7.2;
            }
          }
          if (axis === 'x') ent.vel.x = 0; else ent.vel.z = 0;
        }
        break;
      }
      rest -= s;
    }
  };
  ent.onGround = false;
  move('x', ent.vel.x * dt);
  move('z', ent.vel.z * dt);
  move('y', ent.vel.y * dt);
}

let dropMaterialCache = new Map();

function dropMaterial(tileKey) {
  if (dropMaterialCache.has(tileKey)) return dropMaterialCache.get(tileKey);
  const mat = new THREE.MeshBasicMaterial({
    map: getAtlasTexture(),
    transparent: true,
    alphaTest: 0.1,
    side: THREE.DoubleSide
  });
  dropMaterialCache.set(tileKey, mat);
  return mat;
}

const iconTileKey = itemTileKey;

export class ItemDrop {
  constructor(world, name, count, x, y, z, vx = 0, vy = 2, vz = 0, durability) {
    this.world = world;
    this.name = name;
    this.count = count;
    this.durability = durability;
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3(vx, vy, vz);
    this.width = 0.25;
    this.height = 0.25;
    this.onGround = false;
    this.canJump = false;
    this.age = 0;
    this.pickupDelay = 0.6;
    this.dead = false;

    const key = iconTileKey(name);
    const [u0, v0, u1, v1] = tileUV(key);
    const geo = new THREE.PlaneGeometry(0.35, 0.35);
    const uv = geo.attributes.uv;
    // remap plane UVs into the atlas tile
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    }
    this.mesh = new THREE.Mesh(geo, dropMaterial(key));
  }

  update(dt, sunFactor) {
    this.age += dt;
    this.pickupDelay = Math.max(0, this.pickupDelay - dt);
    this.vel.y -= GRAVITY * 0.6 * dt;
    this.vel.x *= 0.92;
    this.vel.z *= 0.92;
    if (this.world.isLiquid(this.pos.x, this.pos.y, this.pos.z)) {
      this.vel.y = Math.min(this.vel.y + GRAVITY * 0.9 * dt, 1.2); // float up
    }
    moveEntity(this.world, this, dt);
    this.mesh.position.set(this.pos.x, this.pos.y + 0.22 + Math.sin(this.age * 2.4) * 0.05, this.pos.z);
    this.mesh.rotation.y = this.age * 1.4;
    // fade with local light
    const l = Math.max(0.12, this.world.lightAt(this.pos.x, this.pos.y + 0.5, this.pos.z, sunFactor) / 15);
    this.mesh.material.color?.setScalar?.(1); // shared material: light baked via scene tint not per-drop
    if (this.age > 300) this.dead = true; // despawn after 5 minutes
  }
}

export class Creature {
  constructor(world, type, x, y, z) {
    this.world = world;
    this.type = type;
    this.def = CREATURE_DEFS[type];
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.width = this.def.width;
    this.height = this.def.height;
    this.health = this.def.health;
    this.onGround = false;
    this.canJump = true;
    this.dead = false;
    this.dying = 0;         // death animation timer
    this.yaw = Math.random() * Math.PI * 2;
    this.state = 'idle';
    this.stateTimer = Math.random() * 3;
    this.wanderDir = Math.random() * Math.PI * 2;
    this.attackCooldown = 0;
    this.hurtFlash = 0;
    this.iframes = 0;
    this.fuse = -1;         // blastcap fuse
    this.age = 0;

    this.buildModel();
  }

  buildModel() {
    this.group = new THREE.Group();
    this.parts = [];
    this.legs = [];
    for (const [name, part] of Object.entries(this.def.model)) {
      const geo = new THREE.BoxGeometry(...part.size);
      const mat = new THREE.MeshBasicMaterial({ color: part.color });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...part.pos);
      this.group.add(mesh);
      this.parts.push({ mesh, baseColor: new THREE.Color(part.color), emissive: !!part.emissive, basePos: [...part.pos] });
      if (part.leg) this.legs.push(mesh);
      if (part.eyes) {
        // add simple eye pixels
        const eyeGeo = new THREE.BoxGeometry(0.09, 0.09, 0.02);
        const eyeMat = new THREE.MeshBasicMaterial({ color: part.eyes });
        for (const ex of [-0.11, 0.11]) {
          const eye = new THREE.Mesh(eyeGeo, eyeMat);
          eye.position.set(part.pos[0] + ex, part.pos[1] + 0.04, part.pos[2] - part.size[2] / 2 - 0.011);
          this.group.add(eye);
          this.parts.push({ mesh: eye, baseColor: new THREE.Color(part.eyes), emissive: true, basePos: eye.position.toArray() });
        }
      }
    }
  }

  distanceTo(pos) {
    return this.pos.distanceTo(pos);
  }

  hurt(amount, knockDir, game) {
    if (this.dead || this.dying > 0) return false;
    if (this.iframes > 0) return false;
    this.iframes = 0.45;
    this.health -= amount;
    this.hurtFlash = 0.25;
    if (knockDir) {
      this.vel.x += knockDir.x * 7;
      this.vel.z += knockDir.z * 7;
      this.vel.y = Math.max(this.vel.y, 4.2);
    }
    if (this.health <= 0) {
      this.dying = 0.45;
      return 'killed';
    } else if (!this.def.hostile) {
      this.state = 'flee';
      this.stateTimer = 5;
    } else {
      this.state = 'chase';
    }
    return true;
  }

  update(dt, playerPos, game) {
    this.age += dt;
    this.iframes = Math.max(0, this.iframes - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);

    if (this.dying > 0) {
      this.dying -= dt;
      this.group.rotation.z = (0.45 - this.dying) / 0.45 * Math.PI / 2;
      this.group.scale.setScalar(Math.max(0.05, this.dying / 0.45 * 0.5 + 0.5));
      if (this.dying <= 0) this.dead = true;
      return;
    }

    const def = this.def;
    const distToPlayer = this.distanceTo(playerPos);
    const playerAlive = !game.stats.dead && game.mode !== GameMode.CREATIVE;

    // --- AI state transitions ---
    this.stateTimer -= dt;
    if (def.hostile && playerAlive) {
      if (distToPlayer < 16 && this.canSeePlayer(playerPos)) {
        this.state = 'chase';
      } else if (this.state === 'chase' && distToPlayer > 24) {
        this.state = 'wander';
        this.stateTimer = 3;
      }
    }
    if (this.stateTimer <= 0) {
      if (this.state === 'idle') {
        this.state = 'wander';
        this.wanderDir = Math.random() * Math.PI * 2;
        this.stateTimer = 2 + Math.random() * 4;
      } else if (this.state === 'wander') {
        this.state = 'idle';
        this.stateTimer = 1.5 + Math.random() * 3;
      } else if (this.state === 'flee') {
        this.state = 'idle';
        this.stateTimer = 2;
      }
    }

    // --- Movement by state ---
    let speed = 0;
    let dirX = 0, dirZ = 0;
    if (this.state === 'wander') {
      speed = def.speed * 0.6;
      dirX = Math.sin(this.wanderDir);
      dirZ = Math.cos(this.wanderDir);
    } else if (this.state === 'flee') {
      speed = def.fleeSpeed || def.speed * 1.8;
      const away = _v.copy(this.pos).sub(playerPos).setY(0).normalize();
      dirX = away.x; dirZ = away.z;
    } else if (this.state === 'chase' && playerAlive) {
      speed = def.speed;
      const to = _v.copy(playerPos).sub(this.pos).setY(0).normalize();
      dirX = to.x; dirZ = to.z;
    }

    if (speed > 0) {
      this.yaw = Math.atan2(dirX, dirZ);
      this.vel.x += (dirX * speed - this.vel.x) * Math.min(1, 6 * dt);
      this.vel.z += (dirZ * speed - this.vel.z) * Math.min(1, 6 * dt);
    } else {
      this.vel.x *= 0.8;
      this.vel.z *= 0.8;
    }

    // gravity / float
    if (def.floats) {
      this.vel.y = Math.sin(this.age * 1.5) * 0.5;
    } else {
      this.vel.y -= GRAVITY * dt;
      if (this.world.isLiquid(this.pos.x, this.pos.y + 0.3, this.pos.z)) {
        this.vel.y = Math.max(this.vel.y, 2.2); // swim up
      }
    }
    moveEntity(this.world, this, dt);

    // --- Attacks ---
    if (def.explodes && playerAlive) {
      if (distToPlayer < 3 && this.fuse < 0) {
        this.fuse = def.fuseTime;
        game.audio?.play('fuse');
      }
      if (this.fuse >= 0) {
        this.fuse -= dt;
        if (this.fuse <= 0) {
          game.explode(this.pos.clone().setY(this.pos.y + 0.5), def.explosionRadius, def.explosionDamage);
          this.dead = true;
          return;
        }
      }
    } else if (def.hostile && def.damage > 0 && playerAlive) {
      if (distToPlayer < 1.6 && this.attackCooldown <= 0) {
        this.attackCooldown = 1.1;
        game.damagePlayer(def.damage, def.label, this.pos);
      }
    } else if (def.retaliates && this.state === 'chase' && playerAlive) {
      if (distToPlayer < 1.6 && this.attackCooldown <= 0) {
        this.attackCooldown = 1.3;
        game.damagePlayer(def.damage || 2, def.label, this.pos);
      }
    }

    // --- Visuals ---
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    const swing = Math.sin(this.age * 9) * Math.min(0.6, hSpeed * 0.35);
    for (let i = 0; i < this.legs.length; i++) {
      this.legs[i].rotation.x = swing * (i % 2 === 0 ? 1 : -1);
    }
    // fuse flash / hurt flash / voxel light
    const light = Math.max(0.12, this.world.lightAt(this.pos.x, this.pos.y + this.height * 0.6, this.pos.z, game.sky.sunFactor) / 15);
    const flashWhite = this.fuse >= 0 && Math.sin(this.age * 24) > 0;
    for (const part of this.parts) {
      const m = part.mesh.material;
      if (flashWhite) {
        m.color.setRGB(1, 1, 1);
      } else if (this.hurtFlash > 0) {
        m.color.copy(part.baseColor).lerp(new THREE.Color(1, 0.2, 0.2), 0.65);
      } else {
        const l = part.emissive ? 1 : light;
        m.color.copy(part.baseColor).multiplyScalar(l);
      }
    }
    // blastcap swells while fused
    if (def.explodes && this.fuse >= 0) {
      const t = 1 - this.fuse / def.fuseTime;
      this.group.scale.setScalar(1 + t * 0.35);
    }
  }

  canSeePlayer(playerPos) {
    const origin = _v.copy(this.pos).setY(this.pos.y + this.height * 0.8);
    const dir = playerPos.clone().sub(origin);
    const dist = dir.length();
    if (dist < 1) return true;
    dir.normalize();
    const hit = this.world.raycast(origin, dir, dist);
    return !hit;
  }
}

export class EntityManager {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.drops = [];
    this.creatures = [];
    this.spawnTimer = 0;
  }

  clear() {
    for (const d of this.drops) this.scene.remove(d.mesh);
    for (const c of this.creatures) this.scene.remove(c.group);
    this.drops = [];
    this.creatures = [];
  }

  spawnDrop(name, count, x, y, z, scatter = true, durability) {
    if (!getItem(name)) return;
    const a = Math.random() * Math.PI * 2;
    const sp = scatter ? 1.6 : 0.2;
    const drop = new ItemDrop(this.world, name, count, x, y, z,
      Math.cos(a) * sp * Math.random(), 2.4, Math.sin(a) * sp * Math.random(), durability);
    this.drops.push(drop);
    this.scene.add(drop.mesh);
  }

  spawnCreature(type, x, y, z) {
    const c = new Creature(this.world, type, x, y, z);
    this.creatures.push(c);
    this.scene.add(c.group);
    return c;
  }

  countCreatures(hostile) {
    let n = 0;
    for (const c of this.creatures) if (c.def.hostile === hostile) n++;
    return n;
  }

  // Attempt natural spawns around the player.
  trySpawns(playerPos, sunFactor, isNight, dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 1.2;

    const hostileCap = 10, passiveCap = 12;
    const hostiles = this.countCreatures(true);
    const passives = this.countCreatures(false);

    for (let attempt = 0; attempt < 4; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 26 + Math.random() * 26;
      const wx = Math.floor(playerPos.x + Math.cos(ang) * dist);
      const wz = Math.floor(playerPos.z + Math.sin(ang) * dist);
      const chunk = this.world.getChunkAt(wx, wz);
      if (!chunk || chunk.state < 2) continue;

      // surface spawn position
      const surfaceY = this.world.surfaceHeight(wx, wz) + 1;

      // candidate types
      const types = Object.entries(CREATURE_DEFS);
      const pick = types[(Math.random() * types.length) | 0];
      const [type, def] = pick;
      if (Math.random() > def.spawn.weight) continue;

      if (def.hostile) {
        if (hostiles >= hostileCap) continue;
      } else {
        if (passives >= passiveCap) continue;
      }

      let sy = -1;
      if (def.spawn.cave && Math.random() < 0.6) {
        // find a dark air pocket underground
        const y = 8 + (Math.random() * Math.min(50, surfaceY - 10)) | 0;
        if (this.world.getBlockId(wx, y, wz) === B.AIR &&
            this.world.getBlockId(wx, y + 1, wz) === B.AIR &&
            this.world.getBlockDef(wx, y - 1, wz).solid &&
            this.world.getBlockLightAt(wx, y, wz) < 4 &&
            this.world.getSunAt(wx, y, wz) < 4) {
          sy = y;
        }
      } else if (def.spawn.surface) {
        if (surfaceY <= SEA_LEVEL || surfaceY <= 1) continue;
        const groundDef = this.world.getBlockDef(wx, surfaceY - 1, wz);
        if (!groundDef.solid) continue;
        if (this.world.getBlockId(wx, surfaceY, wz) !== B.AIR) continue;
        // light rules
        const light = Math.max(this.world.getBlockLightAt(wx, surfaceY, wz), this.world.getSunAt(wx, surfaceY, wz) * sunFactor);
        if (def.hostile || def.spawn.night) {
          if (light > 5) continue; // hostiles need darkness
        } else {
          if (!isNight === false) { /* passives prefer day */ }
          if (sunFactor < 0.4 && def.spawn.daylight) continue;
        }
        // biome check for passives
        if (def.spawn.biomeMobKey) {
          const biome = this.world.generator.biomeAt(wx, wz);
          const allowed = BIOME_DEFS[biome].passiveMobs;
          if (!allowed.includes(def.spawn.biomeMobKey)) continue;
        }
        sy = surfaceY;
      }

      if (sy < 0) continue;
      this.spawnCreature(type, wx + 0.5, sy + 0.05, wz + 0.5);
      return;
    }
  }

  update(dt, game) {
    const playerPos = game.player.position.clone().setY(game.player.position.y + 0.9);
    const sunFactor = game.sky.sunFactor;

    // --- Drops: physics + pickup ---
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.update(dt, sunFactor);
      if (!d.dead && d.pickupDelay <= 0 && !game.stats.dead) {
        const dist = d.pos.distanceTo(game.player.position.clone().setY(game.player.position.y + 0.5));
        if (dist < 1.8) {
          // magnet toward player
          const to = game.player.position.clone().setY(game.player.position.y + 0.5).sub(d.pos).normalize();
          d.vel.addScaledVector(to, 26 * dt);
        }
        if (dist < 0.85) {
          const left = game.inventory.add(d.name, d.count, d.durability);
          if (left === 0) {
            d.dead = true;
            game.audio?.play('pickup');
          } else {
            d.count = left;
          }
        }
      }
      if (d.dead) {
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        this.drops.splice(i, 1);
      }
    }

    // --- Creatures ---
    for (let i = this.creatures.length - 1; i >= 0; i--) {
      const c = this.creatures[i];
      c.update(dt, playerPos, game);
      // occasional ambient call when near the player
      if (!c.dead && Math.random() < dt * 0.03 && c.pos.distanceTo(playerPos) < 14) {
        game.audio?.play('creature', { minGap: 1200 });
      }
      if (c.dead) {
        if (c.dying <= 0 && c.health <= 0) {
          // drop loot
          for (const drop of c.def.drops) {
            const n = drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1));
            if (n > 0) this.spawnDrop(drop.name, n, c.pos.x, c.pos.y + 0.5, c.pos.z);
          }
        }
        this.scene.remove(c.group);
        for (const p of c.parts) { p.mesh.geometry.dispose(); p.mesh.material.dispose(); }
        this.creatures.splice(i, 1);
        continue;
      }
      // despawn far away
      if (c.pos.distanceTo(playerPos) > 96) {
        this.scene.remove(c.group);
        this.creatures.splice(i, 1);
      }
    }

    // --- Natural spawning ---
    this.trySpawns(game.player.position, sunFactor, game.sky.isNight, dt);
  }

  // Find creatures intersecting a ray for melee attacks.
  raycastCreature(origin, dir, maxDist) {
    let best = null, bestT = maxDist;
    for (const c of this.creatures) {
      if (c.dying > 0) continue;
      // ray vs AABB
      const min = new THREE.Vector3(c.pos.x - c.width / 2, c.pos.y, c.pos.z - c.width / 2);
      const max = new THREE.Vector3(c.pos.x + c.width / 2, c.pos.y + c.height, c.pos.z + c.width / 2);
      const t = rayAABB(origin, dir, min, max);
      if (t !== null && t < bestT) {
        best = c;
        bestT = t;
      }
    }
    return best ? { creature: best, dist: bestT } : null;
  }

  creaturesNear(pos, radius) {
    return this.creatures.filter(c => c.pos.distanceTo(pos) < radius);
  }
}

function rayAABB(origin, dir, min, max) {
  let tmin = 0, tmax = Infinity;
  for (const axis of ['x', 'y', 'z']) {
    const o = origin[axis], d = dir[axis];
    if (Math.abs(d) < 1e-9) {
      if (o < min[axis] || o > max[axis]) return null;
    } else {
      let t1 = (min[axis] - o) / d;
      let t2 = (max[axis] - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}
