// Block breaking (progressive), placement, melee combat, eating, interacting.

import * as THREE from 'three';
import { REACH_DISTANCE, GameMode, PLAYER_HEIGHT } from '../core/constants.js';
import { getBlock, B } from '../world/BlockRegistry.js';
import { getItem, isBlockItem } from '../world/ItemRegistry.js';

export class Interaction {
  constructor(game) {
    this.game = game;
    this.target = null;         // current raycast hit
    this.breaking = null;       // { x, y, z, progress, total }
    this.attackCooldown = 0;
    this.eatTimer = 0;
    this.placeCooldown = 0;

    // targeted-block highlight box
    const geo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const edges = new THREE.EdgesGeometry(geo);
    this.highlight = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.7 })
    );
    this.highlight.visible = false;
    game.scene.add(this.highlight);

    // breaking progress overlay (shrinking dark box)
    this.crackMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.004, 1.004, 1.004),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false })
    );
    game.scene.add(this.crackMesh);
  }

  heldItem() {
    const stack = this.game.inventory.selectedStack;
    return stack ? getItem(stack.name) : null;
  }

  // Breaking time for a block with the held item.
  breakTime(blockDef) {
    if (blockDef.hardness < 0) return Infinity;
    if (this.game.mode === GameMode.CREATIVE) return 0.05;
    if (blockDef.hardness === 0) return 0.05;
    const item = this.heldItem();
    let speed = 1;
    if (item?.tool && blockDef.tool && item.tool.class === blockDef.tool) {
      speed = item.tool.speed;
    }
    let time = blockDef.hardness / speed;
    // wrong/no tool on tool-required blocks is slower
    if (blockDef.tool && (!item?.tool || item.tool.class !== blockDef.tool)) time *= 1.6;
    if (this.game.player.headInWater) time *= 3;
    if (!this.game.player.onGround && !this.game.player.flying) time *= 2;
    return time;
  }

  update(dt) {
    const game = this.game;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.placeCooldown = Math.max(0, this.placeCooldown - dt);

    // --- Raycast for target block ---
    const origin = game.player.eyePosition();
    const dir = game.player.lookDirection();
    this.target = game.world.raycast(origin, dir, REACH_DISTANCE);

    if (this.target && getBlock(this.target.id).hardness >= 0) {
      this.highlight.visible = true;
      this.highlight.position.set(this.target.x + 0.5, this.target.y + 0.5, this.target.z + 0.5);
    } else {
      this.highlight.visible = false;
    }

    // --- Mining (hold left mouse) ---
    if (game.input.leftDown && !game.ui.anyModalOpen()) {
      // attack takes priority when a creature is in the crosshair and closer
      const hitCreature = game.entities.raycastCreature(origin, dir, Math.min(REACH_DISTANCE, this.target ? this.target.dist : REACH_DISTANCE));
      if (hitCreature) {
        this.tryAttack(hitCreature.creature, dir);
        this.breaking = null;
      } else if (this.target) {
        this.updateBreaking(dt);
      } else {
        this.breaking = null;
      }
    } else {
      this.breaking = null;
    }

    // crack overlay
    if (this.breaking && this.breaking.total > 0.06) {
      const p = this.breaking.progress / this.breaking.total;
      this.crackMesh.visible = true;
      this.crackMesh.position.set(this.breaking.x + 0.5, this.breaking.y + 0.5, this.breaking.z + 0.5);
      this.crackMesh.material.opacity = p * 0.55;
      this.crackMesh.scale.setScalar(1);
    } else {
      this.crackMesh.visible = false;
    }

    // --- Eating (hold right mouse with food) ---
    const held = this.heldItem();
    if (game.input.rightDown && held?.food && !game.ui.anyModalOpen() &&
        game.stats.hunger < 20 && game.mode === GameMode.SURVIVAL) {
      this.eatTimer += dt;
      if (this.eatTimer > 1.2) {
        this.eatTimer = 0;
        game.stats.eat(held.food);
        if (held.food.sick && Math.random() < held.food.sick) {
          game.stats.damage(2, 'bad food', true);
        }
        game.inventory.consumeSlot(game.inventory.selected);
        game.audio.play('eat');
        game.ui.refreshHotbar();
      }
    } else {
      this.eatTimer = 0;
    }
  }

  updateBreaking(dt) {
    const t = this.target;
    const def = getBlock(t.id);
    const total = this.breakTime(def);
    if (total === Infinity) {
      this.breaking = null;
      return;
    }
    if (!this.breaking || this.breaking.x !== t.x || this.breaking.y !== t.y || this.breaking.z !== t.z) {
      this.breaking = { x: t.x, y: t.y, z: t.z, progress: 0, total };
    }
    this.breaking.total = total;
    this.breaking.progress += dt;
    if (this.breaking.progress % 0.28 < dt) this.game.audio.play('dig');
    if (this.breaking.progress >= total) {
      this.breakBlock(t.x, t.y, t.z, def);
      this.breaking = null;
    }
  }

  breakBlock(x, y, z, def) {
    const game = this.game;
    game.world.setBlock(x, y, z, B.AIR);
    game.audio.play('break');
    game.stats.addExhaustion(0.03);

    // container contents spill
    const containerKey = `${x},${y},${z}`;
    const container = game.world.containers.get(containerKey);
    if (container) {
      const stacks = container.type === 'chest'
        ? container.slots.filter(Boolean)
        : [container.input, container.fuel, container.output].filter(Boolean);
      for (const s of stacks) game.entities.spawnDrop(s.name, s.count, x + 0.5, y + 0.5, z + 0.5, true, s.durability);
      game.world.containers.delete(containerKey);
    }

    // drops
    if (game.mode === GameMode.SURVIVAL) {
      const item = this.heldItem();
      const heldTier = item?.tool?.tier ?? 0;
      const toolOk = def.minTier === 0 ||
        (item?.tool && (def.tool === null || item.tool.class === def.tool || item.tool.class === 'sword') && heldTier >= def.minTier);
      // shears-free design: leaves sometimes drop sticks
      if (def.id === B.LEAVES) {
        if (Math.random() < 0.12) game.entities.spawnDrop('stick', 1, x + 0.5, y + 0.4, z + 0.5);
        if (Math.random() < 0.05) game.entities.spawnDrop('berries', 1, x + 0.5, y + 0.4, z + 0.5);
      } else if (def.drop !== false && toolOk) {
        const dropName = def.drop || def.name;
        if (getItem(dropName)) {
          game.entities.spawnDrop(dropName, def.dropCount || 1, x + 0.5, y + 0.4, z + 0.5, false);
        }
      }
      // tool durability
      if (item?.tool && def.hardness > 0.05) {
        game.inventory.damageTool(game.inventory.selected);
      }
      game.ui.refreshHotbar();
    }
  }

  // Right-click: interact with block or place held block.
  interact() {
    const game = this.game;
    if (this.placeCooldown > 0) return;
    const t = this.target;

    // 1) interactable blocks (bench, furnace, chest)
    if (t) {
      const def = getBlock(t.id);
      if (def.interact && !game.player.crouching) {
        this.placeCooldown = 0.25;
        game.ui.openBlockInterface(def.interact, t.x, t.y, t.z);
        game.audio.play('click');
        return;
      }
    }

    // 2) eat handled in update (hold); 3) place block
    const stack = game.inventory.selectedStack;
    if (!stack || !t) return;
    const item = getItem(stack.name);
    if (!item || item.block === undefined) return;

    const px = t.x + t.face[0], py = t.y + t.face[1], pz = t.z + t.face[2];
    const existing = game.world.getBlockDef(px, py, pz);
    if (existing.solid || existing.id === item.block) return;

    // don't place inside the player
    const blockDef = getBlock(item.block);
    if (blockDef.solid && this.intersectsPlayer(px, py, pz)) return;
    // torches/plants need solid ground below (simple support rule)
    if (blockDef.cross && !game.world.getBlockDef(px, py - 1, pz).solid) return;

    game.world.setBlock(px, py, pz, item.block);
    this.placeCooldown = 0.18;
    game.audio.play('place');
    if (game.mode === GameMode.SURVIVAL) {
      game.inventory.consumeSlot(game.inventory.selected);
      game.ui.refreshHotbar();
    }
  }

  intersectsPlayer(bx, by, bz) {
    const p = this.game.player.position;
    const hw = 0.3;
    return bx + 1 > p.x - hw && bx < p.x + hw &&
           bz + 1 > p.z - hw && bz < p.z + hw &&
           by + 1 > p.y && by < p.y + PLAYER_HEIGHT;
  }

  tryAttack(creature, dir) {
    if (this.attackCooldown > 0) return;
    this.attackCooldown = 0.45;
    const game = this.game;
    const item = this.heldItem();
    let damage = item?.damage ?? 1;
    // falling strikes hit harder
    if (game.player.velocity.y < -3) damage = Math.ceil(damage * 1.5);
    const knock = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    const result = creature.hurt(damage, knock, game);
    if (result) {
      game.audio.play('hit');
      game.stats.addExhaustion(0.1);
      if (item?.tool) game.inventory.damageTool(game.inventory.selected);
      game.ui.refreshHotbar();
    }
  }

  // Q — drop selected item
  dropSelected() {
    const game = this.game;
    const stack = game.inventory.selectedStack;
    if (!stack) return;
    const dir = game.player.lookDirection();
    const eye = game.player.eyePosition();
    game.entities.spawnDrop(stack.name, 1, eye.x + dir.x, eye.y - 0.2, eye.z + dir.z, false, stack.durability);
    const drop = game.entities.drops[game.entities.drops.length - 1];
    drop.vel.set(dir.x * 6, 2, dir.z * 6);
    drop.pickupDelay = 1.4;
    game.inventory.consumeSlot(game.inventory.selected);
    game.ui.refreshHotbar();
    game.audio.play('click');
  }
}
