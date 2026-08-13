// Data-driven crafting recipes.
//
// Shapeless recipes: { inputs: { itemName: count }, output, count, bench? }
// `bench: true` means the recipe needs the Workbench (3x3-tier crafting).
// Recipe detection is automatic — the UI lists every recipe whose inputs
// the player can currently afford.

export const RECIPES = [
  // --- Basics ---
  { id: 'planks', inputs: { log: 1 }, output: 'planks', count: 4 },
  { id: 'sticks', inputs: { planks: 2 }, output: 'stick', count: 4 },
  { id: 'craft_bench', inputs: { planks: 4 }, output: 'craft_bench', count: 1 },
  { id: 'torch', inputs: { stick: 1, coal: 1 }, output: 'torch', count: 4 },
  { id: 'chest', inputs: { planks: 8 }, output: 'chest', count: 1, bench: true },
  { id: 'furnace', inputs: { cobblestone: 8 }, output: 'furnace', count: 1, bench: true },
  { id: 'glass_pane_block', inputs: { sand: 2, coal: 1 }, output: 'glass', count: 2, bench: true },
  { id: 'bricks', inputs: { brick_piece: 4 }, output: 'bricks', count: 1, bench: true },
  { id: 'sandstone', inputs: { sand: 4 }, output: 'sandstone', count: 1, bench: true },
  { id: 'flatbread', inputs: { grain: 3 }, output: 'flatbread', count: 1 },

  // --- Timber tools (hand craftable) ---
  { id: 'timber_pickaxe', inputs: { planks: 3, stick: 2 }, output: 'timber_pickaxe', count: 1 },
  { id: 'timber_axe', inputs: { planks: 3, stick: 2 }, output: 'timber_axe', count: 1 },
  { id: 'timber_shovel', inputs: { planks: 1, stick: 2 }, output: 'timber_shovel', count: 1 },
  { id: 'timber_sword', inputs: { planks: 2, stick: 1 }, output: 'timber_sword', count: 1 },

  // --- Stone tools (bench) ---
  { id: 'stone_pickaxe', inputs: { cobblestone: 3, stick: 2 }, output: 'stone_pickaxe', count: 1, bench: true },
  { id: 'stone_axe', inputs: { cobblestone: 3, stick: 2 }, output: 'stone_axe', count: 1, bench: true },
  { id: 'stone_shovel', inputs: { cobblestone: 1, stick: 2 }, output: 'stone_shovel', count: 1, bench: true },
  { id: 'stone_sword', inputs: { cobblestone: 2, stick: 1 }, output: 'stone_sword', count: 1, bench: true },

  // --- Iron tools (bench) ---
  { id: 'iron_pickaxe', inputs: { iron_ingot: 3, stick: 2 }, output: 'iron_pickaxe', count: 1, bench: true },
  { id: 'iron_axe', inputs: { iron_ingot: 3, stick: 2 }, output: 'iron_axe', count: 1, bench: true },
  { id: 'iron_shovel', inputs: { iron_ingot: 1, stick: 2 }, output: 'iron_shovel', count: 1, bench: true },
  { id: 'iron_sword', inputs: { iron_ingot: 2, stick: 1 }, output: 'iron_sword', count: 1, bench: true },

  // --- Aurum tools (bench) ---
  { id: 'aurum_pickaxe', inputs: { aurum_ingot: 3, stick: 2 }, output: 'aurum_pickaxe', count: 1, bench: true },
  { id: 'aurum_axe', inputs: { aurum_ingot: 3, stick: 2 }, output: 'aurum_axe', count: 1, bench: true },
  { id: 'aurum_shovel', inputs: { aurum_ingot: 1, stick: 2 }, output: 'aurum_shovel', count: 1, bench: true },
  { id: 'aurum_sword', inputs: { aurum_ingot: 2, stick: 1 }, output: 'aurum_sword', count: 1, bench: true },

  // --- Lumen tools (bench) ---
  { id: 'lumen_pickaxe', inputs: { lumen_crystal: 3, iron_ingot: 1, stick: 2 }, output: 'lumen_pickaxe', count: 1, bench: true },
  { id: 'lumen_axe', inputs: { lumen_crystal: 3, iron_ingot: 1, stick: 2 }, output: 'lumen_axe', count: 1, bench: true },
  { id: 'lumen_shovel', inputs: { lumen_crystal: 1, iron_ingot: 1, stick: 2 }, output: 'lumen_shovel', count: 1, bench: true },
  { id: 'lumen_sword', inputs: { lumen_crystal: 2, iron_ingot: 1, stick: 1 }, output: 'lumen_sword', count: 1, bench: true }
];

// Furnace smelting is driven by the item registry (`smelt` property);
// fuel values come from the `fuel` property.
export const SMELT_TIME = 5;  // seconds per item
