// First-person held item view: a small mesh anchored to the camera that
// shows the selected hotbar item, bobs with movement and swings on use.

import * as THREE from 'three';
import { getItem, itemTileKey } from '../world/ItemRegistry.js';
import { getBlock } from '../world/BlockRegistry.js';
import { tileUV, getAtlasTexture } from '../gfx/TextureAtlas.js';

export class HandView {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    game.scene.add(game.camera);
    game.camera.add(this.group);
    this.group.position.set(0.42, -0.38, -0.7);
    this.currentItem = undefined;
    this.mesh = null;
    this.swing = 0;

    // bare hand: simple skin-tone box
    this.handMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xd8a878 })
    );
    this.handMesh.rotation.set(0.2, -0.3, 0);
  }

  setItemMesh(name) {
    if (this.mesh) {
      this.group.remove(this.mesh);
      if (this.mesh !== this.handMesh) {
        this.mesh.geometry.dispose();
        this.mesh.material.dispose?.();
      }
      this.mesh = null;
    }
    if (!name) {
      this.mesh = this.handMesh;
      this.group.add(this.mesh);
      return;
    }
    const item = getItem(name);
    if (item?.block !== undefined && !getBlock(item.block).cross) {
      // block: mini textured cube
      const def = getBlock(item.block);
      const t = def.textures || {};
      const keys = [
        t.all || t.side, t.all || t.side,
        t.all || t.top || t.side, t.all || t.bottom || t.side,
        t.all || t.side, t.all || t.side
      ];
      const geo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
      const uvAttr = geo.attributes.uv;
      for (let face = 0; face < 6; face++) {
        const [u0, v0, u1, v1] = tileUV(keys[face] || 'stone');
        for (let i = 0; i < 4; i++) {
          const vi = face * 4 + i;
          uvAttr.setXY(vi, u0 + uvAttr.getX(vi) * (u1 - u0), v0 + uvAttr.getY(vi) * (v1 - v0));
        }
      }
      this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: getAtlasTexture() }));
      this.mesh.rotation.set(0.15, 0.6, 0);
    } else {
      // item/plant: textured quad
      const key = itemTileKey(name);
      const [u0, v0, u1, v1] = tileUV(key);
      const geo = new THREE.PlaneGeometry(0.34, 0.34);
      const uvAttr = geo.attributes.uv;
      for (let i = 0; i < uvAttr.count; i++) {
        uvAttr.setXY(i, u0 + uvAttr.getX(i) * (u1 - u0), v0 + uvAttr.getY(i) * (v1 - v0));
      }
      this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        map: getAtlasTexture(), transparent: true, alphaTest: 0.1, side: THREE.DoubleSide
      }));
      this.mesh.rotation.set(-0.1, 0.4, 0.35);
    }
    this.group.add(this.mesh);
  }

  triggerSwing() {
    this.swing = 1;
  }

  update(dt) {
    const game = this.game;
    const stack = game.inventory.selectedStack;
    const name = stack ? stack.name : null;
    if (name !== this.currentItem) {
      this.currentItem = name;
      this.setItemMesh(name);
    }

    // swing while mining or attacking
    if (game.interaction.breaking || game.interaction.attackCooldown > 0.25) {
      this.swing = Math.min(1, this.swing + dt * 10);
    } else {
      this.swing = Math.max(0, this.swing - dt * 6);
    }
    const swingAngle = Math.sin(performance.now() * 0.02) * 0.35 * this.swing;

    // movement bob
    const bob = game.player.bobAmount;
    const phase = game.player.bobPhase;
    this.group.position.set(
      0.42 + Math.cos(phase) * 0.012 * bob,
      -0.38 + Math.abs(Math.sin(phase * 2)) * 0.02 * bob - this.swing * 0.06,
      -0.7
    );
    this.group.rotation.set(swingAngle * 0.8 - this.swing * 0.3, swingAngle * 0.3, 0);

    // match local voxel light
    if (this.mesh?.material?.color) {
      const p = game.player.position;
      const l = Math.max(0.2, game.world.lightAt(p.x, p.y + 1.4, p.z, Math.max(0.16, game.sky.sunFactor)) / 15);
      const base = this.mesh === this.handMesh ? new THREE.Color(0xd8a878) : new THREE.Color(1, 1, 1);
      this.mesh.material.color.copy(base).multiplyScalar(0.3 + 0.7 * l);
    }
  }
}
