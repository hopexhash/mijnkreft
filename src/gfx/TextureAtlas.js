// Procedurally generated pixel-art texture atlas.
// Every texture in the game is drawn here in code — fully original assets.

import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

export const TILE = 16;        // pixels per tile
export const ATLAS_TILES = 16; // tiles per atlas row
const ATLAS_PX = TILE * ATLAS_TILES;

// tile key -> tile index
const tileIndex = new Map();
let atlasCanvas = null;
let atlasTexture = null;
const iconCache = new Map();

function shade(hex, f) {
  const r = Math.min(255, Math.max(0, ((hex >> 16) & 255) * f)) | 0;
  const g = Math.min(255, Math.max(0, ((hex >> 8) & 255) * f)) | 0;
  const b = Math.min(255, Math.max(0, (hex & 255) * f)) | 0;
  return `rgb(${r},${g},${b})`;
}

function px(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

// Speckled base fill: base color with random darker/lighter pixels
function speckle(ctx, base, variance, seed, density = 1) {
  const rand = mulberry32(seed);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (rand() > density) continue;
      const f = 1 + (rand() * 2 - 1) * variance;
      px(ctx, x, y, shade(base, f));
    }
  }
}

function orePattern(ctx, stoneBase, oreColor, seed, blobs = 5) {
  speckle(ctx, stoneBase, 0.12, seed);
  const rand = mulberry32(seed ^ 0x9E3779B9);
  for (let i = 0; i < blobs; i++) {
    const cx = 2 + (rand() * 12) | 0;
    const cy = 2 + (rand() * 12) | 0;
    px(ctx, cx, cy, shade(oreColor, 1.0));
    px(ctx, cx + 1, cy, shade(oreColor, 0.85));
    px(ctx, cx, cy + 1, shade(oreColor, 0.8));
    if (rand() > 0.5) px(ctx, cx + 1, cy + 1, shade(oreColor, 1.1));
    if (rand() > 0.6) px(ctx, cx - 1, cy, shade(oreColor, 0.95));
  }
}

function plank(ctx, base, seed) {
  speckle(ctx, base, 0.06, seed);
  const dark = shade(base, 0.72);
  for (const y of [3, 7, 11, 15]) {
    ctx.fillStyle = dark;
    ctx.fillRect(0, y, TILE, 1);
  }
  const rand = mulberry32(seed ^ 77);
  for (let i = 0; i < 6; i++) {
    px(ctx, (rand() * 16) | 0, [1, 5, 9, 13][(rand() * 4) | 0], shade(base, 0.8));
  }
}

function crossPlant(ctx, stemColor, leafColor, seed, opts = {}) {
  const rand = mulberry32(seed);
  ctx.clearRect(0, 0, TILE, TILE);
  // grass-like blades
  const blades = opts.blades ?? 7;
  for (let i = 0; i < blades; i++) {
    const x = 2 + ((rand() * 12) | 0);
    const h = 5 + ((rand() * 8) | 0);
    for (let y = 0; y < h; y++) {
      px(ctx, x + (y > h - 3 && rand() > 0.5 ? (rand() > 0.5 ? 1 : -1) : 0), 15 - y, shade(leafColor, 0.85 + rand() * 0.3));
    }
  }
  if (opts.flower) {
    const fx = 6 + ((rand() * 4) | 0), fy = 3 + ((rand() * 2) | 0);
    for (let y = fy + 3; y < 16; y++) px(ctx, fx + 1, y, shade(stemColor, 0.9));
    ctx.fillStyle = shade(opts.flower, 1.0);
    ctx.fillRect(fx, fy, 3, 3);
    px(ctx, fx + 1, fy + 1, shade(opts.flowerCenter ?? 0xffe080, 1.05));
  }
  if (opts.berries) {
    for (let i = 0; i < 5; i++) {
      px(ctx, 3 + ((rand() * 10) | 0), 4 + ((rand() * 9) | 0), shade(0xd8385e, 0.9 + rand() * 0.3));
    }
  }
}

// --- Tile painters keyed by name ---
const painters = {
  grass_top: c => { speckle(c, 0x6fae4a, 0.09, 101); },
  grass_side: c => {
    speckle(c, 0x8a6b47, 0.1, 102);
    const rand = mulberry32(103);
    for (let x = 0; x < TILE; x++) {
      const d = 2 + ((rand() * 3) | 0);
      for (let y = 0; y < d; y++) px(c, x, y, shade(0x6fae4a, 0.85 + rand() * 0.3));
    }
  },
  dirt: c => speckle(c, 0x8a6b47, 0.12, 104),
  stone: c => {
    speckle(c, 0x8d8d93, 0.07, 105);
    const rand = mulberry32(106);
    for (let i = 0; i < 5; i++) {
      const x = (rand() * 13) | 0, y = (rand() * 13) | 0;
      c.fillStyle = shade(0x8d8d93, 0.82);
      c.fillRect(x, y, 2 + ((rand() * 2) | 0), 1);
    }
  },
  cobblestone: c => {
    speckle(c, 0x7d7f84, 0.1, 107);
    const rand = mulberry32(108);
    // rounded stone lumps
    for (let i = 0; i < 7; i++) {
      const x = (rand() * 12) | 0, y = (rand() * 12) | 0, s = 3 + ((rand() * 3) | 0);
      c.fillStyle = shade(0x8f9196, 0.85 + rand() * 0.35);
      c.fillRect(x, y, s, s);
      c.fillStyle = shade(0x5c5e63, 1);
      c.fillRect(x, y + s - 1, s, 1);
      c.fillRect(x + s - 1, y, 1, s);
    }
  },
  mossy_cobble: c => {
    painters.cobblestone(c);
    const rand = mulberry32(109);
    for (let i = 0; i < 26; i++) px(c, (rand() * 16) | 0, (rand() * 16) | 0, shade(0x5f8f43, 0.85 + rand() * 0.3));
  },
  sand: c => speckle(c, 0xdccf9a, 0.06, 110),
  sandstone: c => {
    speckle(c, 0xd4c48e, 0.05, 111);
    c.fillStyle = shade(0xd4c48e, 0.85);
    c.fillRect(0, 4, TILE, 1); c.fillRect(0, 10, TILE, 1);
  },
  gravel: c => {
    speckle(c, 0x93897f, 0.16, 112);
    const rand = mulberry32(113);
    for (let i = 0; i < 9; i++) {
      const x = (rand() * 14) | 0, y = (rand() * 14) | 0;
      c.fillStyle = shade(0xa79c92, 0.75 + rand() * 0.5);
      c.fillRect(x, y, 2, 2);
    }
  },
  log_side: c => {
    speckle(c, 0x6b4f30, 0.08, 114);
    const rand = mulberry32(115);
    for (const x of [1, 5, 9, 13]) {
      for (let y = 0; y < TILE; y++) if (rand() > 0.25) px(c, x, y, shade(0x543c22, 0.9 + rand() * 0.2));
    }
  },
  log_top: c => {
    speckle(c, 0x6b4f30, 0.06, 116);
    for (let r = 6; r >= 1; r -= 2) {
      c.strokeStyle = shade(r % 4 === 0 ? 0x8a6b42 : 0xa4854f, 1);
      c.strokeRect(8 - r + 0.5, 8 - r + 0.5, r * 2 - 1, r * 2 - 1);
    }
  },
  planks: c => plank(c, 0xb08a55, 117),
  leaves: c => {
    c.clearRect(0, 0, TILE, TILE);
    const rand = mulberry32(118);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      if (rand() > 0.16) px(c, x, y, shade(0x4d8f3a, 0.7 + rand() * 0.55));
    }
  },
  water: c => {
    const rand = mulberry32(119);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const f = 0.85 + rand() * 0.3;
      c.fillStyle = `rgba(${(40 * f) | 0},${(92 * f) | 0},${(190 * f) | 0},0.75)`;
      c.fillRect(x, y, 1, 1);
    }
  },
  glass: c => {
    c.clearRect(0, 0, TILE, TILE);
    c.fillStyle = 'rgba(200,225,235,0.28)';
    c.fillRect(0, 0, TILE, TILE);
    c.fillStyle = 'rgba(235,245,250,0.9)';
    c.fillRect(0, 0, TILE, 1); c.fillRect(0, 15, TILE, 1);
    c.fillRect(0, 0, 1, TILE); c.fillRect(15, 0, 1, TILE);
    px(c, 3, 2, 'rgba(255,255,255,0.8)'); px(c, 4, 3, 'rgba(255,255,255,0.8)');
    px(c, 2, 3, 'rgba(255,255,255,0.6)');
  },
  coal_ore: c => orePattern(c, 0x8d8d93, 0x26262b, 120, 6),
  copper_ore: c => orePattern(c, 0x8d8d93, 0xc47b4a, 121, 5),
  iron_ore: c => orePattern(c, 0x8d8d93, 0xd8b9a4, 122, 5),
  gold_ore: c => orePattern(c, 0x8d8d93, 0xe8c53a, 123, 4),
  crystal_ore: c => {
    speckle(c, 0x6f7079, 0.1, 124);
    const rand = mulberry32(125);
    for (let i = 0; i < 4; i++) {
      const x = 2 + ((rand() * 11) | 0), y = 2 + ((rand() * 11) | 0);
      px(c, x, y, '#9ff0ff'); px(c, x + 1, y, '#5ecbe8');
      px(c, x, y + 1, '#5ecbe8'); px(c, x + 1, y + 1, '#c8f8ff');
    }
  },
  snow: c => speckle(c, 0xf2f5fa, 0.03, 126),
  snow_side: c => {
    speckle(c, 0x8a6b47, 0.1, 127);
    for (let x = 0; x < TILE; x++) for (let y = 0; y < 4; y++) px(c, x, y, shade(0xf2f5fa, 0.94 + (x * y % 3) * 0.03));
  },
  ice: c => {
    const rand = mulberry32(128);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const f = 0.9 + rand() * 0.15;
      c.fillStyle = `rgba(${(160 * f) | 0},${(205 * f) | 0},${(240 * f) | 0},0.9)`;
      c.fillRect(x, y, 1, 1);
    }
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fillRect(2, 2, 1, 4); c.fillRect(3, 5, 1, 3); c.fillRect(10, 8, 1, 5);
  },
  clay: c => speckle(c, 0x9aa4b5, 0.06, 129),
  bricks: c => {
    speckle(c, 0xa8563e, 0.08, 130);
    c.fillStyle = shade(0xd9d4cc, 0.95);
    for (const y of [0, 4, 8, 12]) c.fillRect(0, y, TILE, 1);
    for (const [x, y] of [[4, 0], [12, 0], [8, 4], [0, 4], [4, 8], [12, 8], [8, 12], [0, 12]]) c.fillRect(x, y, 1, 4);
  },
  torch: c => {
    c.clearRect(0, 0, TILE, TILE);
    c.fillStyle = shade(0x8a6b42, 1);
    c.fillRect(7, 6, 2, 10);
    c.fillStyle = shade(0x6b4f30, 1);
    px(c, 7, 8, shade(0x6b4f30, 1)); px(c, 8, 11, shade(0x6b4f30, 1));
    c.fillStyle = '#ffd75e';
    c.fillRect(6, 3, 4, 3);
    c.fillStyle = '#fff3b0';
    c.fillRect(7, 4, 2, 2);
    px(c, 7, 2, '#ff9a3d'); px(c, 8, 2, '#ff9a3d');
  },
  bench_top: c => {
    plank(c, 0xb08a55, 131);
    c.fillStyle = shade(0x5c3f22, 1);
    c.strokeStyle = shade(0x5c3f22, 1);
    c.strokeRect(1.5, 1.5, 13, 13);
    c.fillRect(7, 2, 2, 12); c.fillRect(2, 7, 12, 2);
  },
  bench_side: c => {
    plank(c, 0xa07a48, 132);
    c.fillStyle = shade(0x5c3f22, 1);
    c.fillRect(0, 0, TILE, 2);
    c.fillStyle = shade(0xc49a60, 1);
    c.fillRect(2, 4, 3, 3); c.fillRect(11, 4, 3, 3);
  },
  furnace_top: c => { speckle(c, 0x77797e, 0.07, 133); c.strokeStyle = shade(0x55575c, 1); c.strokeRect(0.5, 0.5, 15, 15); },
  furnace_side: c => {
    speckle(c, 0x77797e, 0.07, 134);
    c.fillStyle = shade(0x3a3b3f, 1);
    c.fillRect(4, 7, 8, 6);
    c.fillStyle = '#ff8a2a';
    c.fillRect(5, 9, 6, 3);
    c.fillStyle = '#ffd75e';
    c.fillRect(6, 10, 2, 2); px(c, 9, 10, '#ffd75e');
  },
  chest_top: c => {
    plank(c, 0x9a6f3f, 135);
    c.strokeStyle = shade(0x54371c, 1);
    c.strokeRect(0.5, 0.5, 15, 15);
  },
  chest_side: c => {
    plank(c, 0x9a6f3f, 136);
    c.fillStyle = shade(0x54371c, 1);
    c.fillRect(0, 6, TILE, 1);
    c.fillStyle = shade(0xd8c26a, 1);
    c.fillRect(7, 4, 2, 4);
    c.strokeStyle = shade(0x54371c, 1);
    c.strokeRect(0.5, 0.5, 15, 15);
  },
  tall_grass: c => crossPlant(c, 0x4d8f3a, 0x5fa845, 137),
  flower_red: c => crossPlant(c, 0x4d8f3a, 0x5fa845, 138, { blades: 3, flower: 0xe04545, flowerCenter: 0xffd75e }),
  flower_yellow: c => crossPlant(c, 0x4d8f3a, 0x5fa845, 139, { blades: 3, flower: 0xf0c93a, flowerCenter: 0xa8722a }),
  shrub: c => crossPlant(c, 0x8a6b42, 0xa08a4a, 140, { blades: 8 }),
  frost_fern: c => crossPlant(c, 0x88aac0, 0xa8ccd8, 141, { blades: 6 }),
  berry_bush: c => crossPlant(c, 0x3d7a30, 0x4d8f3a, 142, { blades: 9, berries: true }),
  cactus_top: c => { speckle(c, 0x4a8f4f, 0.06, 143); c.strokeStyle = shade(0x2f6b35, 1); c.strokeRect(1.5, 1.5, 13, 13); },
  cactus_side: c => {
    speckle(c, 0x4a8f4f, 0.07, 144);
    const rand = mulberry32(145);
    for (const x of [2, 6, 10, 14]) for (let y = 0; y < TILE; y += 2) if (rand() > 0.4) px(c, x - 1, y, shade(0x2f6b35, 1));
    for (let i = 0; i < 6; i++) px(c, (mulberry32(146 + i)() * 15) | 0, (mulberry32(150 + i)() * 15) | 0, '#e8f0d8');
  },
  bedrock: c => {
    speckle(c, 0x3a3a40, 0.25, 147);
  }
};

// --- Item icon painters (drawn into their own atlas tiles for UI usage) ---
function toolIcon(headColor, handleColor, kind) {
  return c => {
    c.clearRect(0, 0, TILE, TILE);
    const H = shade(handleColor, 1), Hd = shade(handleColor, 0.8);
    // diagonal handle
    for (let i = 0; i < 9; i++) {
      px(c, 3 + i, 12 - i, H);
      px(c, 4 + i, 12 - i, Hd);
    }
    const M = shade(headColor, 1), Ml = shade(headColor, 1.25), Md = shade(headColor, 0.7);
    if (kind === 'pickaxe') {
      const pts = [[6, 2], [7, 2], [8, 2], [9, 2], [10, 3], [11, 4], [12, 6], [5, 3], [4, 4], [3, 6], [12, 5], [3, 5]];
      for (const [x, y] of pts) px(c, x, y, M);
      px(c, 7, 1, Ml); px(c, 8, 1, Ml); px(c, 3, 7, Md); px(c, 12, 7, Md);
    } else if (kind === 'axe') {
      for (const [x, y] of [[8, 1], [9, 1], [10, 2], [10, 3], [10, 4], [9, 5], [7, 2], [6, 3], [6, 4], [7, 5], [8, 5], [7, 1], [8, 2], [9, 2], [8, 3], [9, 3], [7, 3], [7, 4], [8, 4], [9, 4]]) px(c, x, y, M);
      px(c, 8, 0, Ml); px(c, 6, 5, Md);
    } else if (kind === 'shovel') {
      for (const [x, y] of [[10, 2], [11, 2], [12, 2], [10, 3], [11, 3], [12, 3], [11, 4], [12, 4], [12, 1], [11, 1]]) px(c, x, y, M);
      px(c, 12, 0, Ml);
    } else if (kind === 'sword') {
      c.clearRect(0, 0, TILE, TILE);
      for (let i = 0; i < 9; i++) { px(c, 12 - i, 3 + i, M); px(c, 13 - i, 3 + i, Ml); }
      px(c, 13, 2, Ml);
      // guard
      px(c, 4, 10, Hd); px(c, 6, 8, Hd); px(c, 5, 9, Hd);
      px(c, 3, 12, H); px(c, 2, 13, H);
    }
  };
}

function blobIcon(color, opts = {}) {
  return c => {
    c.clearRect(0, 0, TILE, TILE);
    const rand = mulberry32(opts.seed ?? 7);
    const cx = 8, cy = 9, r = opts.r ?? 4;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r + (rand() > 0.5 ? 1 : 0)) {
        px(c, cx + x, cy + y, shade(color, 0.85 + rand() * 0.35));
      }
    }
    if (opts.shine) { px(c, cx - 1, cy - 2, shade(0xffffff, 0.95)); px(c, cx - 2, cy - 1, shade(color, 1.4)); }
  };
}

function ingotIcon(color) {
  return c => {
    c.clearRect(0, 0, TILE, TILE);
    const M = shade(color, 1), Ml = shade(color, 1.3), Md = shade(color, 0.7);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 10; x++) px(c, 3 + x - (y > 1 ? 1 : 0), 7 + y, y === 0 ? Ml : (y === 3 ? Md : M));
    px(c, 2, 10, Md); px(c, 12, 8, Ml);
  };
}

function foodIcon(color, opts = {}) {
  return c => {
    c.clearRect(0, 0, TILE, TILE);
    const rand = mulberry32(opts.seed ?? 3);
    for (let y = 4; y < 13; y++) for (let x = 4; x < 12; x++) {
      const dx = x - 7.5, dy = y - 8.5;
      if (dx * dx / 16 + dy * dy / 20 <= 1) px(c, x, y, shade(color, 0.85 + rand() * 0.3));
    }
    if (opts.bone) { c.fillStyle = '#efe8d8'; c.fillRect(6, 12, 4, 2); }
    if (opts.leaf) { px(c, 8, 3, '#4d8f3a'); px(c, 9, 2, '#4d8f3a'); }
  };
}

const iconPainters = {
  stick: c => {
    c.clearRect(0, 0, TILE, TILE);
    for (let i = 0; i < 10; i++) { px(c, 3 + i, 12 - i, shade(0x8a6b42, 1)); px(c, 4 + i, 12 - i, shade(0x6b4f30, 1)); }
  },
  coal: blobIcon(0x2b2b30, { seed: 11, shine: true }),
  raw_copper: blobIcon(0xc47b4a, { seed: 12 }),
  raw_iron: blobIcon(0xcdb4a0, { seed: 13 }),
  raw_aurum: blobIcon(0xe8c53a, { seed: 14, shine: true }),
  copper_ingot: ingotIcon(0xc47b4a),
  iron_ingot: ingotIcon(0xd8d8e0),
  aurum_ingot: ingotIcon(0xe8c53a),
  lumen_crystal: c => {
    c.clearRect(0, 0, TILE, TILE);
    for (const [x, y, f] of [[8, 3, 1.2], [7, 4, 1], [8, 4, 1.3], [9, 4, 1], [6, 5, 0.8], [7, 5, 1.1], [8, 5, 1.4], [9, 5, 1.1], [10, 5, 0.8], [7, 6, 0.9], [8, 6, 1.2], [9, 6, 0.9], [7, 7, 0.8], [8, 7, 1], [9, 7, 0.8], [8, 8, 0.9], [8, 9, 0.7], [8, 10, 0.6], [8, 11, 0.5]]) {
      px(c, x, y + 1, shade(0x7fdcf0, f));
    }
  },
  clay_lump: blobIcon(0x9aa4b5, { seed: 15 }),
  brick_piece: c => {
    c.clearRect(0, 0, TILE, TILE);
    c.fillStyle = shade(0xa8563e, 1);
    c.fillRect(4, 7, 8, 5);
    c.fillStyle = shade(0xa8563e, 1.25);
    c.fillRect(4, 7, 8, 1);
    c.fillStyle = shade(0xa8563e, 0.7);
    c.fillRect(4, 11, 8, 1);
  },
  hide: c => {
    c.clearRect(0, 0, TILE, TILE);
    c.fillStyle = shade(0x9a6f3f, 1);
    c.fillRect(4, 4, 8, 9);
    c.fillStyle = shade(0x9a6f3f, 0.75);
    c.fillRect(4, 4, 2, 2); c.fillRect(10, 4, 2, 2); c.fillRect(4, 11, 2, 2); c.fillRect(10, 11, 2, 2);
  },
  bone_shard: c => {
    c.clearRect(0, 0, TILE, TILE);
    for (let i = 0; i < 7; i++) { px(c, 4 + i, 11 - i, '#efe8d8'); px(c, 5 + i, 11 - i, '#d8d0bc'); }
    c.fillStyle = '#efe8d8';
    c.fillRect(3, 10, 2, 2); c.fillRect(10, 3, 2, 2);
  },
  glow_dust: c => {
    c.clearRect(0, 0, TILE, TILE);
    const rand = mulberry32(16);
    for (let i = 0; i < 18; i++) px(c, 3 + ((rand() * 10) | 0), 5 + ((rand() * 8) | 0), shade(0xbff060, 0.8 + rand() * 0.5));
  },
  blast_pod: c => {
    c.clearRect(0, 0, TILE, TILE);
    const rand = mulberry32(17);
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
      if (x * x + y * y <= 10) px(c, 8 + x, 9 + y, shade(0x7a9a3a, 0.85 + rand() * 0.3));
    }
    px(c, 8, 5, shade(0x4a5a20, 1)); px(c, 8, 4, shade(0xffa030, 1)); px(c, 9, 3, shade(0xffd75e, 1));
  },
  berries: c => {
    c.clearRect(0, 0, TILE, TILE);
    const rand = mulberry32(18);
    for (const [x, y] of [[5, 7], [8, 6], [10, 9], [6, 10], [9, 11]]) {
      c.fillStyle = shade(0xd8385e, 0.85 + rand() * 0.3);
      c.fillRect(x, y, 2, 2);
      px(c, x, y - 1, '#4d8f3a');
    }
  },
  raw_meat: foodIcon(0xd06a6a, { seed: 21, bone: true }),
  cooked_meat: foodIcon(0x9a5a34, { seed: 22, bone: true }),
  raw_bird: foodIcon(0xe0b0a0, { seed: 23 }),
  cooked_bird: foodIcon(0xc08a4a, { seed: 24 }),
  cactus_fruit: foodIcon(0xd85a9a, { seed: 25, leaf: true }),
  grain: c => {
    c.clearRect(0, 0, TILE, TILE);
    const rand = mulberry32(26);
    for (let i = 0; i < 4; i++) {
      const x = 4 + i * 2;
      for (let y = 0; y < 9; y++) px(c, x, 13 - y, shade(0xd8c26a, 0.85 + rand() * 0.3));
      px(c, x - 1, 5, shade(0xe8d88a, 1)); px(c, x + 1, 4, shade(0xe8d88a, 1));
    }
  },
  flatbread: c => {
    c.clearRect(0, 0, TILE, TILE);
    c.fillStyle = shade(0xc89a5a, 1);
    for (let y = 0; y < 4; y++) c.fillRect(3 + y, 6 + y, 10, 1);
    c.fillStyle = shade(0xc89a5a, 1.2);
    c.fillRect(3, 6, 10, 1);
    px(c, 6, 7, shade(0xa87a3a, 1)); px(c, 9, 8, shade(0xa87a3a, 1));
  }
};

// tool icons per tier
const TIER_COLORS = { timber: 0xa07a48, stone: 0x8d8d93, iron: 0xd8d8e0, aurum: 0xe8c53a, lumen: 0x7fdcf0 };
for (const [prefix, color] of Object.entries(TIER_COLORS)) {
  for (const kind of ['pickaxe', 'axe', 'shovel', 'sword']) {
    iconPainters[`${prefix}_${kind}`] = toolIcon(color, 0x8a6b42, kind);
  }
}

export function buildAtlas() {
  atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = ATLAS_PX;
  atlasCanvas.height = ATLAS_PX;
  const ctx = atlasCanvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;

  const tile = document.createElement('canvas');
  tile.width = TILE; tile.height = TILE;
  const tctx = tile.getContext('2d', { willReadFrequently: true });

  let idx = 0;
  const paintAll = { ...painters, ...iconPainters };
  for (const [key, painter] of Object.entries(paintAll)) {
    tctx.clearRect(0, 0, TILE, TILE);
    painter(tctx);
    const tx = (idx % ATLAS_TILES) * TILE;
    const ty = Math.floor(idx / ATLAS_TILES) * TILE;
    ctx.clearRect(tx, ty, TILE, TILE);
    ctx.drawImage(tile, tx, ty);
    tileIndex.set(key, idx);
    idx++;
  }

  atlasTexture = new THREE.CanvasTexture(atlasCanvas);
  atlasTexture.magFilter = THREE.NearestFilter;
  atlasTexture.minFilter = THREE.NearestFilter;
  atlasTexture.generateMipmaps = false;
  atlasTexture.colorSpace = THREE.SRGBColorSpace;
  return atlasTexture;
}

export function getAtlasTexture() {
  return atlasTexture;
}

// UV rect of a tile key: [u0, v0, u1, v1] (v flipped for three.js)
export function tileUV(key) {
  const idx = tileIndex.get(key) ?? 0;
  const tx = idx % ATLAS_TILES;
  const ty = Math.floor(idx / ATLAS_TILES);
  const s = 1 / ATLAS_TILES;
  const pad = 0.02 * s; // bleed padding
  const u0 = tx * s + pad;
  const v1 = 1 - ty * s - pad;
  const u1 = (tx + 1) * s - pad;
  const v0 = 1 - (ty + 1) * s + pad;
  return [u0, v0, u1, v1];
}

// data URL for a tile — used for inventory icons in the DOM UI
export function tileDataURL(key) {
  if (iconCache.has(key)) return iconCache.get(key);
  if (!atlasCanvas || !tileIndex.has(key)) return '';
  const idx = tileIndex.get(key);
  const tx = (idx % ATLAS_TILES) * TILE;
  const ty = Math.floor(idx / ATLAS_TILES) * TILE;
  const c = document.createElement('canvas');
  c.width = TILE; c.height = TILE;
  const cc = c.getContext('2d');
  cc.imageSmoothingEnabled = false;
  cc.drawImage(atlasCanvas, tx, ty, TILE, TILE, 0, 0, TILE, TILE);
  const url = c.toDataURL();
  iconCache.set(key, url);
  return url;
}

export function hasTile(key) {
  return tileIndex.has(key);
}
