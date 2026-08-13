// Original biome definitions and biome selection from climate noise.

import { B } from './BlockRegistry.js';

export const Biome = Object.freeze({
  MEADOWS: 0,       // Green Meadows — plains
  WOODLAND: 1,      // Dense Woodland — forest
  DRYLANDS: 2,      // Drylands — desert
  FROZEN_PEAKS: 3,  // Frozen Peaks — snowy mountains
  HIGHLANDS: 4,     // Rocky Highlands — hills/mountains
  SHORES: 5,        // Coastal Shores — beach
  OCEAN: 6,         // Deep Ocean
  TUNDRA: 7         // Snowfields
});

export const BIOME_DEFS = {
  [Biome.MEADOWS]: {
    name: 'Green Meadows',
    top: B.GRASS, filler: B.DIRT,
    treeChance: 0.0035, treeType: 'oak',
    plantChance: 0.09,
    plants: [[B.TALL_GRASS, 0.72], [B.FLOWER_YELLOW, 0.12], [B.FLOWER_RED, 0.08], [B.BERRY_BUSH, 0.08]],
    passiveMobs: ['grazer', 'tusker', 'peeper'],
    fogTint: [0.78, 0.85, 1.0]
  },
  [Biome.WOODLAND]: {
    name: 'Dense Woodland',
    top: B.GRASS, filler: B.DIRT,
    treeChance: 0.028, treeType: 'oak',
    plantChance: 0.06,
    plants: [[B.TALL_GRASS, 0.6], [B.BERRY_BUSH, 0.25], [B.FLOWER_RED, 0.15]],
    passiveMobs: ['grazer', 'tusker', 'peeper', 'glowbug'],
    fogTint: [0.72, 0.83, 0.95]
  },
  [Biome.DRYLANDS]: {
    name: 'Drylands',
    top: B.SAND, filler: B.SAND, deepFiller: B.SANDSTONE,
    treeChance: 0.0022, treeType: 'cactus',
    plantChance: 0.012,
    plants: [[B.SHRUB, 1.0]],
    passiveMobs: ['peeper'],
    fogTint: [0.95, 0.88, 0.72]
  },
  [Biome.FROZEN_PEAKS]: {
    name: 'Frozen Peaks',
    top: B.SNOW, filler: B.STONE,
    treeChance: 0.004, treeType: 'fir',
    plantChance: 0.02,
    plants: [[B.SNOW_LAYER_PLANT, 1.0]],
    passiveMobs: [],
    fogTint: [0.86, 0.9, 0.98]
  },
  [Biome.HIGHLANDS]: {
    name: 'Rocky Highlands',
    top: B.GRASS, filler: B.DIRT, rocky: true,
    treeChance: 0.006, treeType: 'fir',
    plantChance: 0.04,
    plants: [[B.TALL_GRASS, 0.8], [B.SHRUB, 0.2]],
    passiveMobs: ['grazer', 'peeper'],
    fogTint: [0.8, 0.85, 0.95]
  },
  [Biome.SHORES]: {
    name: 'Coastal Shores',
    top: B.SAND, filler: B.SAND,
    treeChance: 0.0012, treeType: 'oak',
    plantChance: 0.01,
    plants: [[B.SHRUB, 1.0]],
    passiveMobs: ['peeper'],
    fogTint: [0.82, 0.9, 1.0]
  },
  [Biome.OCEAN]: {
    name: 'Deep Ocean',
    top: B.GRAVEL, filler: B.GRAVEL,
    treeChance: 0, treeType: null,
    plantChance: 0,
    plants: [],
    passiveMobs: [],
    fogTint: [0.65, 0.8, 1.0]
  },
  [Biome.TUNDRA]: {
    name: 'Snowfields',
    top: B.SNOW, filler: B.DIRT,
    treeChance: 0.005, treeType: 'fir',
    plantChance: 0.03,
    plants: [[B.SNOW_LAYER_PLANT, 1.0]],
    passiveMobs: ['grazer'],
    fogTint: [0.88, 0.92, 1.0]
  }
};

// Select a biome from climate values (all roughly [-1, 1]) and terrain height.
export function selectBiome(temperature, humidity, height, seaLevel) {
  if (height < seaLevel - 3) return Biome.OCEAN;
  if (height <= seaLevel + 1) {
    return temperature < -0.45 ? Biome.TUNDRA : Biome.SHORES;
  }
  if (height > seaLevel + 34) return Biome.FROZEN_PEAKS;
  if (height > seaLevel + 20) return temperature < -0.3 ? Biome.FROZEN_PEAKS : Biome.HIGHLANDS;
  if (temperature < -0.42) return Biome.TUNDRA;
  if (temperature > 0.42 && humidity < -0.1) return Biome.DRYLANDS;
  if (humidity > 0.15) return Biome.WOODLAND;
  return Biome.MEADOWS;
}
