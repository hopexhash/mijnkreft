// Original creature definitions — all data-driven.
// Models are built from colored boxes (no copyrighted designs).

export const CREATURE_DEFS = {
  // --- Passive ---
  grazer: {
    label: 'Forest Grazer',
    hostile: false,
    health: 10,
    speed: 1.6,
    fleeSpeed: 3.4,
    width: 0.9, height: 1.2,
    drops: [{ name: 'raw_meat', min: 1, max: 2 }, { name: 'hide', min: 0, max: 1 }],
    spawn: { surface: true, daylight: true, biomeMobKey: 'grazer', weight: 0.5 },
    model: {
      body: { size: [0.9, 0.7, 1.3], pos: [0, 0.65, 0], color: 0x8f7a55 },
      head: { size: [0.5, 0.5, 0.5], pos: [0, 1.05, -0.8], color: 0xa08a60 },
      legFL: { size: [0.22, 0.5, 0.22], pos: [-0.28, 0.25, -0.45], color: 0x6f5e42, leg: true },
      legFR: { size: [0.22, 0.5, 0.22], pos: [0.28, 0.25, -0.45], color: 0x6f5e42, leg: true },
      legBL: { size: [0.22, 0.5, 0.22], pos: [-0.28, 0.25, 0.45], color: 0x6f5e42, leg: true },
      legBR: { size: [0.22, 0.5, 0.22], pos: [0.28, 0.25, 0.45], color: 0x6f5e42, leg: true }
    }
  },
  tusker: {
    label: 'Bristled Tusker',
    hostile: false,
    retaliates: true,
    health: 12,
    speed: 1.8,
    fleeSpeed: 3.8,
    damage: 3,
    width: 0.9, height: 0.95,
    drops: [{ name: 'raw_meat', min: 1, max: 3 }],
    spawn: { surface: true, daylight: true, biomeMobKey: 'tusker', weight: 0.4 },
    model: {
      body: { size: [0.85, 0.6, 1.2], pos: [0, 0.5, 0], color: 0x5e4a38 },
      head: { size: [0.55, 0.5, 0.45], pos: [0, 0.6, -0.75], color: 0x6e5844 },
      tuskL: { size: [0.08, 0.2, 0.08], pos: [-0.2, 0.42, -0.95], color: 0xe8e0cc },
      tuskR: { size: [0.08, 0.2, 0.08], pos: [0.2, 0.42, -0.95], color: 0xe8e0cc },
      legFL: { size: [0.2, 0.4, 0.2], pos: [-0.25, 0.2, -0.4], color: 0x4a3a2c, leg: true },
      legFR: { size: [0.2, 0.4, 0.2], pos: [0.25, 0.2, -0.4], color: 0x4a3a2c, leg: true },
      legBL: { size: [0.2, 0.4, 0.2], pos: [-0.25, 0.2, 0.4], color: 0x4a3a2c, leg: true },
      legBR: { size: [0.2, 0.4, 0.2], pos: [0.25, 0.2, 0.4], color: 0x4a3a2c, leg: true }
    }
  },
  peeper: {
    label: 'Meadow Peeper',
    hostile: false,
    health: 4,
    speed: 2.4,
    fleeSpeed: 4.2,
    width: 0.45, height: 0.6,
    drops: [{ name: 'raw_bird', min: 1, max: 1 }],
    spawn: { surface: true, daylight: true, biomeMobKey: 'peeper', weight: 0.5 },
    model: {
      body: { size: [0.4, 0.4, 0.5], pos: [0, 0.35, 0], color: 0xd8d0c0 },
      head: { size: [0.28, 0.28, 0.28], pos: [0, 0.68, -0.2], color: 0xe8e0d0 },
      beak: { size: [0.1, 0.08, 0.14], pos: [0, 0.64, -0.4], color: 0xe8a03a },
      wingL: { size: [0.08, 0.25, 0.4], pos: [-0.24, 0.4, 0], color: 0xb8b0a0 },
      wingR: { size: [0.08, 0.25, 0.4], pos: [0.24, 0.4, 0], color: 0xb8b0a0 },
      legL: { size: [0.06, 0.18, 0.06], pos: [-0.1, 0.09, 0], color: 0xe8a03a, leg: true },
      legR: { size: [0.06, 0.18, 0.06], pos: [0.1, 0.09, 0], color: 0xe8a03a, leg: true }
    }
  },
  glowbug: {
    label: 'Glowbug',
    hostile: false,
    health: 3,
    speed: 1.2,
    fleeSpeed: 2.4,
    width: 0.4, height: 0.4,
    floats: true,
    glow: true,
    drops: [{ name: 'glow_dust', min: 1, max: 2 }],
    spawn: { surface: true, night: true, biomeMobKey: 'glowbug', weight: 0.35 },
    model: {
      body: { size: [0.35, 0.3, 0.45], pos: [0, 0.3, 0], color: 0x445028 },
      tail: { size: [0.25, 0.22, 0.2], pos: [0, 0.3, 0.3], color: 0xbff060, emissive: true },
      wingL: { size: [0.3, 0.04, 0.24], pos: [-0.25, 0.48, 0], color: 0xcfe0d8 },
      wingR: { size: [0.3, 0.04, 0.24], pos: [0.25, 0.48, 0], color: 0xcfe0d8 }
    }
  },

  // --- Hostile ---
  night_crawler: {
    label: 'Night Crawler',
    hostile: true,
    health: 14,
    speed: 2.9,
    damage: 4,
    width: 0.65, height: 1.75,
    burnsInDay: false,
    drops: [{ name: 'glow_dust', min: 0, max: 2 }],
    spawn: { surface: true, night: true, weight: 0.6 },
    model: {
      body: { size: [0.55, 0.75, 0.3], pos: [0, 1.05, 0], color: 0x3a3d52 },
      head: { size: [0.45, 0.45, 0.45], pos: [0, 1.62, 0], color: 0x474b66, eyes: 0x9fe0ff },
      armL: { size: [0.18, 0.7, 0.18], pos: [-0.38, 1.0, 0], color: 0x33364a, leg: true },
      armR: { size: [0.18, 0.7, 0.18], pos: [0.38, 1.0, 0], color: 0x33364a, leg: true },
      legL: { size: [0.2, 0.68, 0.2], pos: [-0.15, 0.34, 0], color: 0x2c2f42, leg: true },
      legR: { size: [0.2, 0.68, 0.2], pos: [0.15, 0.34, 0], color: 0x2c2f42, leg: true }
    }
  },
  bone_warrior: {
    label: 'Bone Warrior',
    hostile: true,
    health: 16,
    speed: 2.6,
    damage: 5,
    width: 0.6, height: 1.8,
    drops: [{ name: 'bone_shard', min: 1, max: 3 }],
    spawn: { surface: true, night: true, cave: true, weight: 0.45 },
    model: {
      body: { size: [0.5, 0.7, 0.28], pos: [0, 1.05, 0], color: 0xd8d2c0 },
      ribs: { size: [0.52, 0.4, 0.3], pos: [0, 1.15, 0], color: 0xc4bca8 },
      head: { size: [0.42, 0.42, 0.42], pos: [0, 1.62, 0], color: 0xe4dece, eyes: 0x743a3a },
      armL: { size: [0.14, 0.68, 0.14], pos: [-0.36, 1.0, 0], color: 0xcfc8b4, leg: true },
      armR: { size: [0.14, 0.68, 0.14], pos: [0.36, 1.0, 0], color: 0xcfc8b4, leg: true },
      legL: { size: [0.15, 0.68, 0.15], pos: [-0.14, 0.34, 0], color: 0xbcb5a0, leg: true },
      legR: { size: [0.15, 0.68, 0.15], pos: [0.14, 0.34, 0], color: 0xbcb5a0, leg: true }
    }
  },
  cave_stalker: {
    label: 'Cave Stalker',
    hostile: true,
    health: 12,
    speed: 3.4,
    damage: 3,
    width: 0.8, height: 0.8,
    drops: [{ name: 'coal', min: 0, max: 2 }],
    spawn: { cave: true, weight: 0.5 },
    model: {
      body: { size: [0.7, 0.4, 0.9], pos: [0, 0.45, 0], color: 0x2e3236 },
      head: { size: [0.4, 0.3, 0.35], pos: [0, 0.55, -0.55], color: 0x383d42, eyes: 0xc03a3a },
      legFL: { size: [0.12, 0.4, 0.12], pos: [-0.4, 0.2, -0.3], color: 0x25282c, leg: true },
      legFR: { size: [0.12, 0.4, 0.12], pos: [0.4, 0.2, -0.3], color: 0x25282c, leg: true },
      legBL: { size: [0.12, 0.4, 0.12], pos: [-0.4, 0.2, 0.3], color: 0x25282c, leg: true },
      legBR: { size: [0.12, 0.4, 0.12], pos: [0.4, 0.2, 0.3], color: 0x25282c, leg: true }
    }
  },
  blastcap: {
    // Original explosive creature: a swollen walking fungus that
    // over-pressurizes and bursts when close to the player.
    label: 'Blastcap',
    hostile: true,
    health: 10,
    speed: 2.2,
    damage: 0,
    explodes: true,
    fuseTime: 1.3,
    explosionRadius: 2.6,
    explosionDamage: 14,
    width: 0.7, height: 1.1,
    drops: [{ name: 'blast_pod', min: 1, max: 2 }],
    spawn: { surface: true, night: true, cave: true, weight: 0.3 },
    model: {
      stem: { size: [0.45, 0.6, 0.45], pos: [0, 0.5, 0], color: 0xcfc8a8 },
      cap: { size: [0.75, 0.45, 0.75], pos: [0, 0.95, 0], color: 0x7a9a3a },
      spotA: { size: [0.14, 0.06, 0.14], pos: [-0.2, 1.2, -0.2], color: 0xdfe8b8 },
      spotB: { size: [0.14, 0.06, 0.14], pos: [0.22, 1.2, 0.15], color: 0xdfe8b8 },
      legL: { size: [0.14, 0.2, 0.14], pos: [-0.14, 0.1, 0], color: 0xb0a888, leg: true },
      legR: { size: [0.14, 0.2, 0.14], pos: [0.14, 0.1, 0], color: 0xb0a888, leg: true }
    }
  }
};
