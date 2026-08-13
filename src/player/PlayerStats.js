// Survival stats: health, hunger, drowning, starvation, regeneration, death.

import { MAX_HEALTH, MAX_HUNGER, GameMode } from '../core/constants.js';

export class PlayerStats {
  constructor() {
    this.health = MAX_HEALTH;
    this.hunger = MAX_HUNGER;
    this.saturation = 5;
    this.air = 10;              // seconds of air under water
    this.dead = false;
    this.invulnUntil = 0;       // ms timestamp for i-frames
    this.exhaustion = 0;

    this.onDamage = null;       // callback(amount, cause)
    this.onDeath = null;        // callback(cause)
    this.hungerTimer = 0;
    this.regenTimer = 0;
    this.starveTimer = 0;
    this.drownTimer = 0;
  }

  reset() {
    this.health = MAX_HEALTH;
    this.hunger = MAX_HUNGER;
    this.saturation = 5;
    this.air = 10;
    this.dead = false;
    this.exhaustion = 0;
  }

  damage(amount, cause = 'generic', ignoreIFrames = false) {
    if (this.dead) return false;
    const now = performance.now();
    if (!ignoreIFrames && now < this.invulnUntil) return false;
    this.invulnUntil = now + 600;
    this.health = Math.max(0, this.health - amount);
    if (this.onDamage) this.onDamage(amount, cause);
    if (this.health <= 0) {
      this.dead = true;
      if (this.onDeath) this.onDeath(cause);
    }
    return true;
  }

  heal(amount) {
    if (this.dead) return;
    this.health = Math.min(MAX_HEALTH, this.health + amount);
  }

  eat(food) {
    this.hunger = Math.min(MAX_HUNGER, this.hunger + food.hunger);
    this.saturation = Math.min(this.hunger, this.saturation + (food.saturation || 0));
  }

  addExhaustion(amount) {
    this.exhaustion += amount;
    while (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else this.hunger = Math.max(0, this.hunger - 1);
    }
  }

  // dt seconds; player context: { sprinting, moving, headInWater, gameMode }
  update(dt, ctx) {
    if (this.dead || ctx.gameMode === GameMode.CREATIVE) return;

    // hunger drain over time + activity
    this.hungerTimer += dt;
    if (this.hungerTimer > 8) {
      this.hungerTimer = 0;
      this.addExhaustion(0.5);
    }
    if (ctx.sprinting && ctx.moving) this.addExhaustion(dt * 0.55);

    // regeneration when well fed
    if (this.hunger >= 18 && this.health < MAX_HEALTH) {
      this.regenTimer += dt;
      if (this.regenTimer > 3) {
        this.regenTimer = 0;
        this.heal(1);
        this.addExhaustion(1.2);
      }
    } else {
      this.regenTimer = 0;
    }

    // starvation
    if (this.hunger <= 0) {
      this.starveTimer += dt;
      if (this.starveTimer > 3.5) {
        this.starveTimer = 0;
        this.damage(1, 'starvation', true);
      }
    } else {
      this.starveTimer = 0;
    }

    // drowning
    if (ctx.headInWater) {
      this.air -= dt;
      if (this.air <= 0) {
        this.drownTimer += dt;
        if (this.drownTimer > 1.2) {
          this.drownTimer = 0;
          this.damage(2, 'drowning', true);
        }
      }
    } else {
      this.air = Math.min(10, this.air + dt * 3);
      this.drownTimer = 0;
    }
  }

  serialize() {
    return { health: this.health, hunger: this.hunger, saturation: this.saturation, air: this.air };
  }

  deserialize(data) {
    if (!data) return;
    this.health = data.health ?? MAX_HEALTH;
    this.hunger = data.hunger ?? MAX_HUNGER;
    this.saturation = data.saturation ?? 5;
    this.air = data.air ?? 10;
    this.dead = this.health <= 0;
  }
}
