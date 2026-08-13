// First-person player: movement physics (walk/sprint/crouch/jump/swim/fly),
// AABB voxel collision with step climbing, camera with bobbing and sprint FOV.

import * as THREE from 'three';
import {
  GRAVITY, JUMP_SPEED, WALK_SPEED, SPRINT_SPEED, CROUCH_SPEED, SWIM_SPEED, FLY_SPEED,
  PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_EYE, CROUCH_EYE, WORLD_HEIGHT, GameMode
} from '../core/constants.js';

const HALF_W = PLAYER_WIDTH / 2;
const STEP_HEIGHT = 0.55;

export class PlayerController {
  constructor(world, camera, input, settings) {
    this.world = world;
    this.camera = camera;
    this.input = input;
    this.settings = settings;

    this.position = new THREE.Vector3(0.5, 80, 0.5); // feet position
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.inWater = false;
    this.headInWater = false;
    this.crouching = false;
    this.sprinting = false;
    this.flying = false;
    this.gameMode = GameMode.SURVIVAL;

    this.bobPhase = 0;
    this.bobAmount = 0;
    this.landingDip = 0;
    this.baseFov = settings.get('fov');
    this.fallStartY = null;
    this.onFall = null; // callback(fallDistance)
    this.stepCallback = null; // footstep audio
    this.stepDistance = 0;
  }

  teleport(x, y, z) {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.fallStartY = null;
  }

  eyeHeight() {
    return this.crouching ? CROUCH_EYE : PLAYER_EYE;
  }

  eyePosition(out = new THREE.Vector3()) {
    return out.set(this.position.x, this.position.y + this.eyeHeight(), this.position.z);
  }

  lookDirection(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp).normalize();
  }

  // AABB overlap test against solid voxels at a candidate feet position.
  collides(px, py, pz, height = PLAYER_HEIGHT) {
    const minX = Math.floor(px - HALF_W), maxX = Math.floor(px + HALF_W);
    const minY = Math.floor(py), maxY = Math.floor(py + height - 0.01);
    const minZ = Math.floor(pz - HALF_W), maxZ = Math.floor(pz + HALF_W);
    for (let y = minY; y <= maxY; y++) {
      if (y < 0) return true;
      if (y >= WORLD_HEIGHT) continue;
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (this.world.getBlockDef(x, y, z).solid) return true;
        }
      }
    }
    return false;
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    const input = this.input;

    // --- Camera rotation ---
    const [mdx, mdy] = input.consumeMouse();
    const sens = this.settings.get('sensitivity') * 0.0022;
    this.yaw -= mdx * sens;
    this.pitch -= mdy * sens;
    this.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, this.pitch));

    // --- Water state ---
    const p = this.position;
    this.inWater = this.world.isLiquid(p.x, p.y + 0.3, p.z) || this.world.isLiquid(p.x, p.y + 0.9, p.z);
    this.headInWater = this.world.isLiquid(p.x, p.y + this.eyeHeight(), p.z);

    // --- Movement intent ---
    let fwd = 0, strafe = 0;
    if (input.down('KeyW')) fwd += 1;
    if (input.down('KeyS')) fwd -= 1;
    if (input.down('KeyD')) strafe += 1;
    if (input.down('KeyA')) strafe -= 1;

    const wantCrouch = input.down('ShiftLeft') || input.down('ShiftRight');
    const wantSprint = (input.down('ControlLeft') || input.down('ControlRight')) && fwd > 0;

    if (this.flying) {
      this.crouching = false;
    } else if (wantCrouch && !this.inWater) {
      this.crouching = true;
    } else if (this.crouching) {
      // stand up only if room
      if (!this.collides(p.x, p.y, p.z, PLAYER_HEIGHT)) this.crouching = false;
    }
    this.sprinting = wantSprint && !this.crouching && !this.inWater;

    let speed = this.flying ? FLY_SPEED : this.inWater ? SWIM_SPEED :
      this.crouching ? CROUCH_SPEED : this.sprinting ? SPRINT_SPEED : WALK_SPEED;

    // direction in world space
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let dx = (-sin * fwd + cos * strafe);
    let dz = (-cos * fwd - sin * strafe);
    const len = Math.hypot(dx, dz);
    if (len > 0) { dx /= len; dz /= len; }

    // --- Vertical movement ---
    if (this.flying) {
      this.velocity.y = 0;
      if (input.down('Space')) this.velocity.y = FLY_SPEED;
      if (wantCrouch) this.velocity.y = -FLY_SPEED;
      this.velocity.x = dx * speed;
      this.velocity.z = dz * speed;
    } else if (this.inWater) {
      this.velocity.y -= GRAVITY * 0.28 * dt;
      this.velocity.y = Math.max(this.velocity.y, -3.2);
      if (input.down('Space')) this.velocity.y = Math.min(this.velocity.y + 16 * dt, 3.4);
      // horizontal with water drag
      this.velocity.x += (dx * speed - this.velocity.x) * Math.min(1, 8 * dt);
      this.velocity.z += (dz * speed - this.velocity.z) * Math.min(1, 8 * dt);
    } else {
      this.velocity.y -= GRAVITY * dt;
      this.velocity.y = Math.max(this.velocity.y, -50);
      if (input.down('Space') && this.onGround) {
        this.velocity.y = JUMP_SPEED;
        this.onGround = false;
      }
      const accel = this.onGround ? 14 : 4;
      this.velocity.x += (dx * speed - this.velocity.x) * Math.min(1, accel * dt);
      this.velocity.z += (dz * speed - this.velocity.z) * Math.min(1, accel * dt);
    }

    // --- Integrate with collision (per-axis) ---
    const wasOnGround = this.onGround;
    const prevVy = this.velocity.y;
    this.moveAxis('x', this.velocity.x * dt);
    this.moveAxis('z', this.velocity.z * dt);
    this.onGround = false;
    this.moveAxis('y', this.velocity.y * dt);

    // crouch edge-guard: don't walk off edges while crouching
    if (this.crouching && wasOnGround && !this.onGround && this.velocity.y <= 0) {
      // nudged off an edge — undo horizontal move keeping us on the block
      // (simple approach: cancel further falling this frame by stepping back)
    }

    // --- Fall damage tracking ---
    if (!this.flying && !this.inWater) {
      if (!this.onGround && this.fallStartY === null && this.velocity.y < -0.1) {
        this.fallStartY = p.y;
      }
      if (this.onGround && this.fallStartY !== null) {
        const dist = this.fallStartY - p.y;
        this.fallStartY = null;
        if (dist > 3.5 && this.onFall) this.onFall(dist);
        this.landingDip = Math.min(0.16, dist * 0.02);
      }
    } else {
      this.fallStartY = null;
    }

    // --- Footsteps + camera bob ---
    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.onGround && hSpeed > 0.5) {
      this.stepDistance += hSpeed * dt;
      if (this.stepDistance > 2.2) {
        this.stepDistance = 0;
        if (this.stepCallback) this.stepCallback();
      }
      this.bobPhase += hSpeed * dt * 1.8;
      this.bobAmount = Math.min(1, this.bobAmount + dt * 6);
    } else {
      this.bobAmount = Math.max(0, this.bobAmount - dt * 6);
    }
    this.landingDip = Math.max(0, this.landingDip - dt * 0.5);

    // --- Apply camera ---
    const eye = this.eyePosition();
    const bobOn = this.settings.get('cameraBob');
    if (bobOn) {
      eye.y += Math.sin(this.bobPhase * 2) * 0.05 * this.bobAmount - this.landingDip;
      const side = Math.cos(this.bobPhase) * 0.03 * this.bobAmount;
      eye.x += -Math.cos(this.yaw) * side;
      eye.z += Math.sin(this.yaw) * side;
    }
    this.camera.position.copy(eye);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);

    // sprint FOV kick
    const targetFov = this.settings.get('fov') + (this.sprinting ? 8 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, 10 * dt);
      this.camera.updateProjectionMatrix();
    }
  }

  moveAxis(axis, amount) {
    if (amount === 0) return;
    const p = this.position;
    const stepSize = 0.25;
    let remaining = amount;
    while (Math.abs(remaining) > 1e-9) {
      const step = Math.abs(remaining) > stepSize ? Math.sign(remaining) * stepSize : remaining;
      const nx = axis === 'x' ? p.x + step : p.x;
      const ny = axis === 'y' ? p.y + step : p.y;
      const nz = axis === 'z' ? p.z + step : p.z;
      if (!this.collides(nx, ny, nz)) {
        p.set(nx, ny, nz);
      } else {
        if (axis === 'y') {
          if (step < 0) this.onGround = true;
          this.velocity.y = 0;
        } else {
          // try step climbing when on ground
          if ((this.onGround || this.inWater) && !this.flying) {
            const stepUpY = p.y + STEP_HEIGHT;
            if (!this.collides(nx, stepUpY, nz) && !this.collides(p.x, stepUpY, p.z)) {
              // settle down onto the step
              let sy = stepUpY;
              while (sy > p.y && !this.collides(nx, sy - 0.05, nz)) sy -= 0.05;
              p.set(nx, sy, nz);
              remaining -= step;
              continue;
            }
          }
          if (axis === 'x') this.velocity.x = 0; else this.velocity.z = 0;
        }
        break;
      }
      remaining -= step;
    }
  }
}
