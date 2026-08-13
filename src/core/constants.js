// Global game constants.

export const CHUNK_SIZE = 16;        // horizontal blocks per chunk
export const WORLD_HEIGHT = 128;     // vertical blocks
export const SEA_LEVEL = 62;

export const GRAVITY = 26.0;         // blocks / s^2
export const JUMP_SPEED = 8.6;
export const WALK_SPEED = 4.4;
export const SPRINT_SPEED = 6.2;
export const CROUCH_SPEED = 1.8;
export const SWIM_SPEED = 3.0;
export const FLY_SPEED = 11.0;

export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE = 1.62;
export const CROUCH_EYE = 1.35;

export const REACH_DISTANCE = 5.0;

export const DAY_LENGTH_DEFAULT = 600; // seconds for a full day cycle

export const MAX_STACK = 64;

export const HOTBAR_SIZE = 9;
export const INVENTORY_ROWS = 3;
export const INVENTORY_SIZE = HOTBAR_SIZE * (INVENTORY_ROWS + 1); // 36 (hotbar included)

export const MAX_HEALTH = 20;
export const MAX_HUNGER = 20;

export const GameMode = Object.freeze({
  SURVIVAL: 'survival',
  CREATIVE: 'creative'
});
