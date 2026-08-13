// Data-driven block registry. Every block in the game is defined here.
//
// Block properties:
//   id           numeric id (stable — used by the save format)
//   name         internal name
//   label        display name
//   textures     { top, bottom, side } atlas tile keys (or `all`)
//   hardness     seconds to break bare-handed (0 = instant, -1 = unbreakable)
//   tool         preferred tool class ('pickaxe'|'axe'|'shovel'|null)
//   minTier      minimum tool tier required to get drops (0 = hand)
//   drop         item name dropped (null = drops itself, false = nothing)
//   dropCount    how many items drop
//   transparent  does not fully occlude neighbors
//   solid        has collision
//   liquid       water-like
//   lightEmit    emitted light level 0..15
//   opacity      how much light it blocks (15 = fully opaque)
//   flammable    can burn
//   gravity      falls when unsupported (sand/gravel)
//   cross        rendered as an X-shaped plant sprite
//   interact     opens an interface ('craft'|'furnace'|'chest')

export const BLOCKS = [];
export const BLOCK_BY_NAME = new Map();

let nextId = 0;
function def(props) {
  const block = Object.assign({
    id: nextId++,
    label: props.name,
    textures: null,
    hardness: 1,
    tool: null,
    minTier: 0,
    drop: null,
    dropCount: 1,
    transparent: false,
    solid: true,
    liquid: false,
    lightEmit: 0,
    opacity: 15,
    flammable: false,
    gravity: false,
    cross: false,
    interact: null
  }, props);
  if (block.transparent && props.opacity === undefined) block.opacity = 0;
  BLOCKS[block.id] = block;
  BLOCK_BY_NAME.set(block.name, block);
  return block.id;
}

// --- Block definitions (order matters: ids are save-stable) ---
export const B = {};
B.AIR = def({ name: 'air', label: 'Air', solid: false, transparent: true, opacity: 0, hardness: 0, drop: false });
B.GRASS = def({ name: 'grass', label: 'Meadow Turf', textures: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' }, hardness: 0.7, tool: 'shovel', drop: 'dirt' });
B.DIRT = def({ name: 'dirt', label: 'Dirt', textures: { all: 'dirt' }, hardness: 0.6, tool: 'shovel' });
B.STONE = def({ name: 'stone', label: 'Stone', textures: { all: 'stone' }, hardness: 1.8, tool: 'pickaxe', minTier: 1, drop: 'cobblestone' });
B.COBBLE = def({ name: 'cobblestone', label: 'Cobblestone', textures: { all: 'cobblestone' }, hardness: 2.2, tool: 'pickaxe', minTier: 1 });
B.SAND = def({ name: 'sand', label: 'Sand', textures: { all: 'sand' }, hardness: 0.6, tool: 'shovel', gravity: true });
B.GRAVEL = def({ name: 'gravel', label: 'Gravel', textures: { all: 'gravel' }, hardness: 0.7, tool: 'shovel', gravity: true });
B.LOG = def({ name: 'log', label: 'Timber Log', textures: { top: 'log_top', bottom: 'log_top', side: 'log_side' }, hardness: 2.2, tool: 'axe', flammable: true });
B.PLANKS = def({ name: 'planks', label: 'Timber Planks', textures: { all: 'planks' }, hardness: 1.8, tool: 'axe', flammable: true });
B.LEAVES = def({ name: 'leaves', label: 'Leaves', textures: { all: 'leaves' }, hardness: 0.3, transparent: true, opacity: 1, drop: false, flammable: true });
B.WATER = def({ name: 'water', label: 'Water', textures: { all: 'water' }, hardness: -1, solid: false, liquid: true, transparent: true, opacity: 2, drop: false });
B.GLASS = def({ name: 'glass', label: 'Glass', textures: { all: 'glass' }, hardness: 0.4, transparent: true, opacity: 0, drop: false });
B.COAL_ORE = def({ name: 'coal_ore', label: 'Coal Seam', textures: { all: 'coal_ore' }, hardness: 2.6, tool: 'pickaxe', minTier: 1, drop: 'coal' });
B.COPPER_ORE = def({ name: 'copper_ore', label: 'Copper Vein', textures: { all: 'copper_ore' }, hardness: 2.8, tool: 'pickaxe', minTier: 1, drop: 'raw_copper' });
B.IRON_ORE = def({ name: 'iron_ore', label: 'Iron Vein', textures: { all: 'iron_ore' }, hardness: 3.0, tool: 'pickaxe', minTier: 2, drop: 'raw_iron' });
B.GOLD_ORE = def({ name: 'gold_ore', label: 'Aurum Vein', textures: { all: 'gold_ore' }, hardness: 3.2, tool: 'pickaxe', minTier: 3, drop: 'raw_aurum' });
B.CRYSTAL_ORE = def({ name: 'crystal_ore', label: 'Lumen Crystal', textures: { all: 'crystal_ore' }, hardness: 3.6, tool: 'pickaxe', minTier: 3, drop: 'lumen_crystal', lightEmit: 6 });
B.SNOW = def({ name: 'snow', label: 'Snow Cover', textures: { top: 'snow', bottom: 'dirt', side: 'snow_side' }, hardness: 0.7, tool: 'shovel', drop: 'dirt' });
B.ICE = def({ name: 'ice', label: 'Ice', textures: { all: 'ice' }, hardness: 0.6, tool: 'pickaxe', transparent: true, opacity: 2, drop: false });
B.CLAY = def({ name: 'clay', label: 'Clay', textures: { all: 'clay' }, hardness: 0.7, tool: 'shovel', drop: 'clay_lump', dropCount: 4 });
B.BRICKS = def({ name: 'bricks', label: 'Bricks', textures: { all: 'bricks' }, hardness: 2.4, tool: 'pickaxe', minTier: 1 });
B.TORCH = def({ name: 'torch', label: 'Torch', textures: { all: 'torch' }, hardness: 0, solid: false, transparent: true, opacity: 0, cross: true, lightEmit: 14 });
B.CRAFT_BENCH = def({ name: 'craft_bench', label: 'Workbench', textures: { top: 'bench_top', bottom: 'planks', side: 'bench_side' }, hardness: 2.0, tool: 'axe', interact: 'craft', flammable: true });
B.FURNACE = def({ name: 'furnace', label: 'Smelter', textures: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side' }, hardness: 3.0, tool: 'pickaxe', minTier: 1, interact: 'furnace' });
B.CHEST = def({ name: 'chest', label: 'Storage Crate', textures: { top: 'chest_top', bottom: 'chest_top', side: 'chest_side' }, hardness: 2.0, tool: 'axe', interact: 'chest', flammable: true });
B.TALL_GRASS = def({ name: 'tall_grass', label: 'Wild Grass', textures: { all: 'tall_grass' }, hardness: 0, solid: false, transparent: true, cross: true, drop: false });
B.FLOWER_RED = def({ name: 'flower_red', label: 'Emberbloom', textures: { all: 'flower_red' }, hardness: 0, solid: false, transparent: true, cross: true });
B.FLOWER_YELLOW = def({ name: 'flower_yellow', label: 'Sunpetal', textures: { all: 'flower_yellow' }, hardness: 0, solid: false, transparent: true, cross: true });
B.SHRUB = def({ name: 'shrub', label: 'Dry Shrub', textures: { all: 'shrub' }, hardness: 0, solid: false, transparent: true, cross: true, drop: 'stick' });
B.CACTUS = def({ name: 'cactus', label: 'Spinereed', textures: { top: 'cactus_top', bottom: 'cactus_top', side: 'cactus_side' }, hardness: 0.5, transparent: true, opacity: 15 });
B.SNOW_LAYER_PLANT = def({ name: 'frost_fern', label: 'Frost Fern', textures: { all: 'frost_fern' }, hardness: 0, solid: false, transparent: true, cross: true, drop: false });
B.BERRY_BUSH = def({ name: 'berry_bush', label: 'Berry Bush', textures: { all: 'berry_bush' }, hardness: 0.2, solid: false, transparent: true, cross: true, drop: 'berries', dropCount: 2 });
B.BEDROCK = def({ name: 'bedrock', label: 'Deepslate Core', textures: { all: 'bedrock' }, hardness: -1, drop: false });
B.SANDSTONE = def({ name: 'sandstone', label: 'Sandstone', textures: { all: 'sandstone' }, hardness: 1.6, tool: 'pickaxe', minTier: 1 });
B.MOSSY_COBBLE = def({ name: 'mossy_cobble', label: 'Mossy Cobble', textures: { all: 'mossy_cobble' }, hardness: 2.2, tool: 'pickaxe', minTier: 1 });

export function getBlock(id) {
  return BLOCKS[id] || BLOCKS[B.AIR];
}

export function blockByName(name) {
  return BLOCK_BY_NAME.get(name) || null;
}

// Blocks shown in the creative inventory (everything placeable except air/water handled too)
export function creativeBlocks() {
  return BLOCKS.filter(b => b.id !== B.AIR && b.id !== B.BEDROCK);
}
