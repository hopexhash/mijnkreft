# KREFT — A Voxel Survival Saga

An original, fully playable first-person voxel survival sandbox that runs in the browser.
Explore an endless procedurally generated world, mine resources, craft tools, build,
fight creatures, survive the night, and come back later — your worlds persist.

Every asset is original and generated in code: pixel-art textures are painted onto a
canvas atlas at startup, and all sounds are synthesized with WebAudio. No external
art, audio, or fonts.

## Quick start

```bash
npm install
npm run dev        # → http://localhost:5173
```

Production build: `npm run build` (output in `dist/`, servable from any static host).

## Controls

| Input | Action |
|---|---|
| `W A S D` | Move |
| Mouse | Look |
| `Space` | Jump / swim up (double-tap: toggle flight in Creative) |
| `Shift` | Crouch (edge-safe, slower) / fly down |
| `Ctrl` | Sprint |
| Left mouse (hold) | Break block / attack |
| Right mouse | Place block / interact / eat (hold) |
| Mouse wheel / `1–9` | Hotbar selection |
| `E` | Inventory (+ handcrafting) |
| `Q` | Drop selected item |
| `Esc` | Pause menu / close interface |
| `F3` | Debug overlay (FPS, position, biome, chunk count) |

## Features

- **World**: chunk-streamed infinite-style terrain from layered simplex/FBM noise —
  plains, forests, hills, mountains, drylands, beaches, oceans, rivers, snowfields;
  8 original biomes driven by temperature/humidity/elevation
- **Underground**: tunnel + chamber cave systems, underground lakes, depth-layered
  ore veins (Coal → Copper → Iron → Aurum → Lumen Crystal)
- **Survival**: health, hunger, saturation, drowning, starvation, fall damage,
  regeneration, death with inventory drop, respawning
- **Creative**: flight, no damage, instant breaking, searchable catalog of every block/item
- **Crafting**: data-driven recipes, handcraft + Workbench tiers, automatic recipe detection
- **Tools**: pickaxe/axe/shovel/sword in 5 material tiers with speed, damage, durability
- **Processing**: Smelter with input/fuel/output slots, burn time and progress
- **Storage**: crates whose contents persist in the save
- **Creatures**: original passive (Forest Grazer, Bristled Tusker, Meadow Peeper, Glowbug)
  and hostile (Night Crawler, Bone Warrior, Cave Stalker, exploding Blastcap) with AI,
  spawn rules (dark/night/cave), loot, knockback, i-frames
- **Atmosphere**: full day/night cycle with sunrise/sunset skies, moon and stars,
  voxel sunlight + torch light flood-fill, vertex ambient occlusion, distance fog,
  camera bob, sprint FOV, held-item view, procedural audio
- **Persistence**: multiple named worlds with seed + game mode; saves store terrain
  edit diffs, containers, player state, time of day; autosave every 20 s
- **Settings**: render distance, FOV, sensitivity, resolution scale, volume,
  day length, frame cap, texture filtering, AO, shading, fullscreen, camera bob

## Architecture

```
src/
  core/        Game orchestrator, constants, settings, seeded RNG, noise
  world/       BlockRegistry, ItemRegistry, Chunk, World, WorldGenerator,
               Biomes, Lighting (flood fill), Mesher (culled faces + AO),
               ChunkManager (streaming with per-frame budgets)
  player/      PlayerController (AABB physics), PlayerStats, Interaction,
               HandView, Input
  entities/    EntityManager, creature AI + data-driven CreatureDefs, item drops
  inventory/   Inventory (stacking, durability, serialization)
  crafting/    recipes (data), CraftingSystem (auto-detection)
  gfx/         TextureAtlas — all textures painted procedurally
  sky/         Day/night cycle, sun/moon/stars, fog tinting
  audio/       AudioManager — all sounds synthesized (swappable for samples)
  save/        SaveManager — world index + diff-based saves in localStorage
  ui/          UIManager (menus/HUD), InventoryUI (inventory/craft/chest/furnace/creative)
```

Performance notes: one merged geometry per chunk (opaque + water), only visible
faces emitted, lighting baked per-vertex with a day/night uniform (no remesh at
dusk), generation/meshing time-budgeted per frame, distant chunks unloaded,
edits stored as diffs so saves stay tiny.

## Testing

```bash
npm test            # Vitest unit suite (world gen determinism, inventory, crafting, …)
npm run smoke       # Headless-Chromium end-to-end: create world → mine → craft →
                    # place → walk → save → reload → verify persistence
node scripts/systems.mjs   # Extended in-browser checks: furnace, chests, torch light,
                            # caves/ores, combat, death/respawn, creative, streaming stress
```
