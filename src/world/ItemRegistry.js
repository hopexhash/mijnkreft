// Data-driven item registry.
// Items are either block items (place a block) or pure items (tools, food, materials).
//
// Item properties:
//   name       internal name (matches block name for block items)
//   label      display name
//   block      block id this item places (undefined for pure items)
//   icon       atlas tile key for UI icon
//   stack      max stack size
//   tool       { class, tier, speed, durability }
//   damage     melee damage
//   food       { hunger, saturation } restored when eaten
//   fuel       burn time in seconds when used as furnace fuel
//   smelt      item name this item smelts into

import { BLOCKS, B } from './BlockRegistry.js';
import { MAX_STACK } from '../core/constants.js';

export const ITEMS = new Map();

function item(props) {
  const it = Object.assign({ stack: MAX_STACK, damage: 1 }, props);
  ITEMS.set(it.name, it);
  return it;
}

// Tool tiers: 1 wood, 2 stone, 3 iron, 4 aurum, 5 lumen crystal
export const TIER_NAMES = ['hand', 'timber', 'stone', 'iron', 'aurum', 'lumen'];

function toolSet(prefix, labelPrefix, tier, speed, durability, swordDamage, materialIcon) {
  item({ name: `${prefix}_pickaxe`, label: `${labelPrefix} Pickaxe`, icon: `${prefix}_pickaxe`, stack: 1, tool: { class: 'pickaxe', tier, speed, durability }, damage: 2 + tier });
  item({ name: `${prefix}_axe`, label: `${labelPrefix} Axe`, icon: `${prefix}_axe`, stack: 1, tool: { class: 'axe', tier, speed, durability }, damage: 3 + tier });
  item({ name: `${prefix}_shovel`, label: `${labelPrefix} Shovel`, icon: `${prefix}_shovel`, stack: 1, tool: { class: 'shovel', tier, speed, durability }, damage: 1 + tier });
  item({ name: `${prefix}_sword`, label: `${labelPrefix} Sword`, icon: `${prefix}_sword`, stack: 1, tool: { class: 'sword', tier, speed: 1, durability }, damage: swordDamage });
}

// --- Block items: auto-register every block that has textures ---
for (const b of BLOCKS) {
  if (b.id === B.AIR || b.liquid || b.id === B.BEDROCK) continue;
  item({ name: b.name, label: b.label, block: b.id, icon: null });
}
// water bucket-less creative placement item
item({ name: 'water', label: 'Water', block: B.WATER, icon: null });

// --- Materials ---
item({ name: 'stick', label: 'Stick', icon: 'stick', fuel: 3 });
item({ name: 'coal', label: 'Coal', icon: 'coal', fuel: 24 });
item({ name: 'raw_copper', label: 'Raw Copper', icon: 'raw_copper', smelt: 'copper_ingot' });
item({ name: 'raw_iron', label: 'Raw Iron', icon: 'raw_iron', smelt: 'iron_ingot' });
item({ name: 'raw_aurum', label: 'Raw Aurum', icon: 'raw_aurum', smelt: 'aurum_ingot' });
item({ name: 'copper_ingot', label: 'Copper Ingot', icon: 'copper_ingot' });
item({ name: 'iron_ingot', label: 'Iron Ingot', icon: 'iron_ingot' });
item({ name: 'aurum_ingot', label: 'Aurum Ingot', icon: 'aurum_ingot' });
item({ name: 'lumen_crystal', label: 'Lumen Crystal', icon: 'lumen_crystal' });
item({ name: 'clay_lump', label: 'Clay Lump', icon: 'clay_lump', smelt: 'brick_piece' });
item({ name: 'brick_piece', label: 'Fired Brick', icon: 'brick_piece' });
item({ name: 'hide', label: 'Thick Hide', icon: 'hide' });
item({ name: 'bone_shard', label: 'Bone Shard', icon: 'bone_shard' });
item({ name: 'glow_dust', label: 'Glow Dust', icon: 'glow_dust' });
item({ name: 'blast_pod', label: 'Blast Pod', icon: 'blast_pod' });

// --- Food ---
item({ name: 'berries', label: 'Wild Berries', icon: 'berries', food: { hunger: 2, saturation: 1 } });
item({ name: 'raw_meat', label: 'Raw Cut', icon: 'raw_meat', food: { hunger: 2, saturation: 1, sick: 0.3 }, smelt: 'cooked_meat' });
item({ name: 'cooked_meat', label: 'Roast Cut', icon: 'cooked_meat', food: { hunger: 8, saturation: 6 } });
item({ name: 'raw_bird', label: 'Raw Fowl', icon: 'raw_bird', food: { hunger: 2, saturation: 1, sick: 0.4 }, smelt: 'cooked_bird' });
item({ name: 'cooked_bird', label: 'Roast Fowl', icon: 'cooked_bird', food: { hunger: 6, saturation: 5 } });
item({ name: 'cactus_fruit', label: 'Spine Fruit', icon: 'cactus_fruit', food: { hunger: 3, saturation: 1 } });
item({ name: 'grain', label: 'Wild Grain', icon: 'grain' });
item({ name: 'flatbread', label: 'Flatbread', icon: 'flatbread', food: { hunger: 5, saturation: 4 } });

// --- Tools ---
toolSet('timber', 'Timber', 1, 2.0, 60, 4);
toolSet('stone', 'Stone', 2, 4.0, 132, 5);
toolSet('iron', 'Iron', 3, 6.0, 251, 6);
toolSet('aurum', 'Aurum', 4, 9.0, 96, 6);
toolSet('lumen', 'Lumen', 5, 10.0, 1024, 8);

// Planks and logs burn
ITEMS.get('planks').fuel = 8;
ITEMS.get('log').fuel = 12;
ITEMS.get('craft_bench').fuel = 8;

export function getItem(name) {
  return ITEMS.get(name) || null;
}

// Atlas tile key used to draw this item (icon for pure items,
// block texture for block items).
export function itemTileKey(name) {
  const it = ITEMS.get(name);
  if (!it) return 'stone';
  if (it.icon) return it.icon;
  if (it.block !== undefined) {
    const def = BLOCKS[it.block];
    const t = def?.textures;
    if (!t) return 'stone';
    return t.all || t.side || t.top;
  }
  return 'stone';
}

export function isBlockItem(name) {
  const it = ITEMS.get(name);
  return !!it && it.block !== undefined;
}

// All items available in the creative inventory
export function creativeItems() {
  return [...ITEMS.values()].filter(i => i.name !== 'air');
}
