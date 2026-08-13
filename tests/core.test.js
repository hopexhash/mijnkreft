// Unit tests for deterministic core logic (no DOM/WebGL required).

import { describe, it, expect } from 'vitest';
import { hashSeed, mulberry32, hash2D, hash3D } from '../src/core/rng.js';
import { Noise } from '../src/core/noise.js';
import { WorldGenerator } from '../src/world/WorldGenerator.js';
import { Chunk, blockIndex } from '../src/world/Chunk.js';
import { BLOCKS, B, getBlock, blockByName } from '../src/world/BlockRegistry.js';
import { ITEMS, getItem, itemTileKey } from '../src/world/ItemRegistry.js';
import { Inventory } from '../src/inventory/Inventory.js';
import { CraftingSystem } from '../src/crafting/CraftingSystem.js';
import { RECIPES } from '../src/crafting/recipes.js';
import { SEA_LEVEL, WORLD_HEIGHT, CHUNK_SIZE } from '../src/core/constants.js';

describe('rng', () => {
  it('hashSeed is deterministic', () => {
    expect(hashSeed('hello')).toBe(hashSeed('hello'));
    expect(hashSeed('hello')).not.toBe(hashSeed('world'));
  });
  it('mulberry32 produces stable sequences in [0,1)', () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('hash2D/hash3D deterministic and bounded', () => {
    expect(hash2D(5, -3, 99)).toBe(hash2D(5, -3, 99));
    expect(hash3D(1, 2, 3, 7)).toBe(hash3D(1, 2, 3, 7));
    for (let i = 0; i < 50; i++) {
      const v = hash2D(i, -i * 3, 123);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('noise', () => {
  it('is deterministic per seed and bounded', () => {
    const n1 = new Noise(1234), n2 = new Noise(1234);
    for (let i = 0; i < 50; i++) {
      const x = i * 0.13, y = -i * 0.07;
      expect(n1.noise2D(x, y)).toBeCloseTo(n2.noise2D(x, y), 10);
      expect(Math.abs(n1.noise2D(x, y))).toBeLessThanOrEqual(1.01);
      expect(Math.abs(n1.noise3D(x, y, i * 0.05))).toBeLessThanOrEqual(1.01);
    }
  });
  it('different seeds differ', () => {
    const a = new Noise(1), b = new Noise(2);
    let same = 0;
    for (let i = 1; i < 30; i++) {
      if (Math.abs(a.noise2D(i * 0.31, i * 0.17) - b.noise2D(i * 0.31, i * 0.17)) < 1e-9) same++;
    }
    expect(same).toBeLessThan(5);
  });
});

describe('world generation', () => {
  it('same seed generates identical chunks', () => {
    const g1 = new WorldGenerator('testseed');
    const g2 = new WorldGenerator('testseed');
    const c1 = new Chunk(0, 0), c2 = new Chunk(0, 0);
    g1.generate(c1);
    g2.generate(c2);
    expect(Buffer.from(c1.blocks).equals(Buffer.from(c2.blocks))).toBe(true);
  });
  it('different seeds generate different chunks', () => {
    const g1 = new WorldGenerator('seedA');
    const g2 = new WorldGenerator('seedB');
    const c1 = new Chunk(0, 0), c2 = new Chunk(0, 0);
    g1.generate(c1);
    g2.generate(c2);
    expect(Buffer.from(c1.blocks).equals(Buffer.from(c2.blocks))).toBe(false);
  });
  it('has bedrock at y=0 and reasonable surface', () => {
    const g = new WorldGenerator('bedrocktest');
    const c = new Chunk(0, 0);
    g.generate(c);
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        expect(c.blocks[blockIndex(x, 0, z)]).toBe(B.BEDROCK);
      }
    }
  });
  it('height function is stable and in world range', () => {
    const g = new WorldGenerator('heights');
    for (let i = -200; i < 200; i += 17) {
      const h = g.height(i, -i);
      expect(h).toBeGreaterThanOrEqual(4);
      expect(h).toBeLessThan(WORLD_HEIGHT);
      expect(g.height(i, -i)).toBe(h);
    }
  });
  it('findSpawn returns land above sea level', () => {
    const g = new WorldGenerator('spawnseed');
    const s = g.findSpawn();
    expect(s.y).toBeGreaterThan(SEA_LEVEL);
  });
  it('tree placement is deterministic across chunk borders', () => {
    const g = new WorldGenerator('trees');
    // find a tree
    let found = null;
    for (let x = -100; x < 100 && !found; x++) {
      for (let z = -100; z < 100 && !found; z++) {
        if (g.treeAt(x, z)) found = [x, z];
      }
    }
    expect(found).not.toBeNull();
    const t1 = g.treeAt(found[0], found[1]);
    const t2 = g.treeAt(found[0], found[1]);
    expect(t1).toEqual(t2);
  });
});

describe('block registry', () => {
  it('has stable unique ids', () => {
    const ids = new Set(BLOCKS.map(b => b.id));
    expect(ids.size).toBe(BLOCKS.length);
    expect(B.AIR).toBe(0);
  });
  it('every block with textures has valid drop item', () => {
    for (const b of BLOCKS) {
      if (b.drop && typeof b.drop === 'string') {
        expect(getItem(b.drop), `drop ${b.drop} of ${b.name}`).toBeTruthy();
      }
    }
  });
  it('lookup by name works', () => {
    expect(blockByName('stone').id).toBe(B.STONE);
    expect(getBlock(B.TORCH).lightEmit).toBeGreaterThan(0);
  });
});

describe('item registry', () => {
  it('block items exist for placeable blocks', () => {
    expect(getItem('planks').block).toBe(B.PLANKS);
    expect(getItem('torch').block).toBe(B.TORCH);
  });
  it('tools have durability and tiers', () => {
    const pick = getItem('iron_pickaxe');
    expect(pick.tool.class).toBe('pickaxe');
    expect(pick.tool.tier).toBe(3);
    expect(pick.stack).toBe(1);
  });
  it('itemTileKey resolves for all items', () => {
    for (const [name] of ITEMS) {
      expect(typeof itemTileKey(name)).toBe('string');
    }
  });
  it('smeltable items produce valid outputs', () => {
    for (const [name, item] of ITEMS) {
      if (item.smelt) expect(getItem(item.smelt), `${name} smelts to ${item.smelt}`).toBeTruthy();
    }
  });
});

describe('inventory', () => {
  it('stacks items up to max', () => {
    const inv = new Inventory();
    expect(inv.add('dirt', 100)).toBe(0);
    expect(inv.count('dirt')).toBe(100);
    expect(inv.slots[0].count).toBe(64);
    expect(inv.slots[1].count).toBe(36);
  });
  it('tools do not stack', () => {
    const inv = new Inventory();
    inv.add('timber_pickaxe', 1);
    inv.add('timber_pickaxe', 1);
    expect(inv.slots[0].count).toBe(1);
    expect(inv.slots[1].count).toBe(1);
    expect(inv.slots[0].durability).toBeGreaterThan(0);
  });
  it('remove takes items across stacks', () => {
    const inv = new Inventory();
    inv.add('stone', 80);
    expect(inv.remove('stone', 70)).toBe(70);
    expect(inv.count('stone')).toBe(10);
  });
  it('reports leftover when full', () => {
    const inv = new Inventory(2);
    const left = inv.add('dirt', 200);
    expect(left).toBe(200 - 128);
  });
  it('serializes and restores', () => {
    const inv = new Inventory();
    inv.add('log', 5);
    inv.add('iron_sword', 1);
    inv.selected = 3;
    const data = inv.serialize();
    const inv2 = new Inventory();
    inv2.deserialize(JSON.parse(JSON.stringify(data)));
    expect(inv2.count('log')).toBe(5);
    expect(inv2.count('iron_sword')).toBe(1);
    expect(inv2.selected).toBe(3);
  });
  it('damageTool breaks tools at zero durability', () => {
    const inv = new Inventory();
    inv.add('timber_pickaxe', 1);
    const dur = inv.slots[0].durability;
    for (let i = 0; i < dur - 1; i++) expect(inv.damageTool(0)).toBe(false);
    expect(inv.damageTool(0)).toBe(true);
    expect(inv.slots[0]).toBeNull();
  });
});

describe('crafting', () => {
  it('all recipes reference valid items', () => {
    for (const r of RECIPES) {
      expect(getItem(r.output), `output ${r.output}`).toBeTruthy();
      for (const name of Object.keys(r.inputs)) {
        expect(getItem(name), `input ${name} of ${r.id}`).toBeTruthy();
      }
    }
  });
  it('detects craftable recipes and consumes materials', () => {
    const cs = new CraftingSystem();
    const inv = new Inventory();
    const planksRecipe = RECIPES.find(r => r.id === 'planks');
    expect(cs.canCraft(planksRecipe, inv)).toBe(false);
    inv.add('log', 3);
    expect(cs.canCraft(planksRecipe, inv)).toBe(true);
    expect(cs.craftableCount(planksRecipe, inv)).toBe(3);
    expect(cs.craft(planksRecipe, inv)).toBe(true);
    expect(inv.count('log')).toBe(2);
    expect(inv.count('planks')).toBe(4);
  });
  it('full tool progression is craftable', () => {
    const cs = new CraftingSystem();
    const inv = new Inventory();
    inv.add('log', 10);
    cs.craft(RECIPES.find(r => r.id === 'planks'), inv);
    cs.craft(RECIPES.find(r => r.id === 'planks'), inv);
    cs.craft(RECIPES.find(r => r.id === 'sticks'), inv);
    const pick = RECIPES.find(r => r.id === 'timber_pickaxe');
    expect(cs.canCraft(pick, inv)).toBe(true);
    cs.craft(pick, inv);
    expect(inv.count('timber_pickaxe')).toBe(1);
  });
  it('hand vs bench recipe filtering', () => {
    const cs = new CraftingSystem();
    const hand = cs.availableRecipes(false);
    const bench = cs.availableRecipes(true);
    expect(bench.length).toBeGreaterThan(hand.length);
    expect(hand.every(r => !r.bench)).toBe(true);
  });
});

describe('save round-trip (edits map)', () => {
  it('chunk edits survive serialize/deserialize', () => {
    const edits = new Map([[blockIndex(3, 60, 5), B.PLANKS], [blockIndex(0, 10, 0), B.AIR]]);
    const encoded = JSON.stringify([...edits.entries()]);
    const decoded = new Map(JSON.parse(encoded).map(([i, v]) => [Number(i), v]));
    expect(decoded.get(blockIndex(3, 60, 5))).toBe(B.PLANKS);
    expect(decoded.size).toBe(2);
  });
});
