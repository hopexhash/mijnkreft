// Extended in-browser systems test: furnace, chest persistence, torch
// lighting, creative mode, death/respawn, combat, caves/ores, day/night.
// Drives simulation steps directly through the exposed KREFT handle so the
// results don't depend on headless frame rates.

import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5199 }, logLevel: 'silent' });
await server.listen();
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log('  ✓', name);
  else { console.log('  ✗', name, detail); failures++; }
}

try {
  await page.goto('http://localhost:5199/', { waitUntil: 'load' });
  await page.waitForTimeout(900);

  // ---- Survival world ----
  await page.click('button:has-text("Create World")');
  await page.fill('.seed-row input', 'systemtest7');
  await page.click('button.primary');
  await page.waitForTimeout(4500);

  console.log('FURNACE:');
  const furnace = await page.evaluate(() => {
    const g = window.KREFT.game;
    const p = g.player.position;
    const x = Math.floor(p.x) + 3, z = Math.floor(p.z);
    const y = g.world.surfaceHeight(x, z) + 1;
    g.world.setBlock(x, y, z, 23); // B.FURNACE
    const c = g.world.getContainer(x, y, z, 'furnace');
    c.input = { name: 'raw_iron', count: 2 };
    c.fuel = { name: 'coal', count: 1 };
    // simulate 12 seconds of furnace time
    for (let i = 0; i < 120; i++) g.updateFurnaces(0.1);
    return { output: c.output, input: c.input, burn: c.burnLeft };
  });
  check('smelts raw_iron → iron_ingot', furnace.output?.name === 'iron_ingot' && furnace.output.count === 2, JSON.stringify(furnace));
  check('input consumed', furnace.input === null, JSON.stringify(furnace.input));

  console.log('CHEST:');
  const chest = await page.evaluate(() => {
    const g = window.KREFT.game;
    const p = g.player.position;
    const x = Math.floor(p.x) + 4, z = Math.floor(p.z);
    const y = g.world.surfaceHeight(x, z) + 1;
    g.world.setBlock(x, y, z, 24); // B.CHEST
    const c = g.world.getContainer(x, y, z, 'chest');
    c.slots[0] = { name: 'aurum_ingot', count: 9 };
    c.slots[26] = { name: 'flatbread', count: 3 };
    g.save();
    const raw = localStorage.getItem('kreft.world.v1.' + g.worldId);
    const data = JSON.parse(raw);
    return data.containers[`${x},${y},${z}`];
  });
  check('chest contents saved with world', chest?.slots?.[0]?.name === 'aurum_ingot' && chest.slots[26].count === 3, JSON.stringify(chest)?.slice(0, 120));

  console.log('TORCH LIGHT:');
  const torch = await page.evaluate(async () => {
    const g = window.KREFT.game;
    const p = g.player.position;
    const x = Math.floor(p.x), z = Math.floor(p.z) - 3;
    const y = g.world.surfaceHeight(x, z) + 1;
    const before = g.world.getBlockLightAt(x, y + 1, z);
    g.world.setBlock(x, y, z, 21); // B.TORCH
    // let dirty chunks relight/remesh
    for (let i = 0; i < 30; i++) g.chunkManager.update(g.player.position);
    const at = g.world.getBlockLightAt(x, y, z);
    const near = g.world.getBlockLightAt(x + 3, y, z);
    return { before, at, near };
  });
  check('torch emits light 14', torch.at === 14, JSON.stringify(torch));
  check('light propagates with falloff', torch.near === 11, JSON.stringify(torch));

  console.log('CAVES & ORES:');
  const under = await page.evaluate(() => {
    const g = window.KREFT.game;
    // scan loaded chunks for caves (air below y=50) and ores
    let caveAir = 0;
    const ores = { coal_ore: 0, copper_ore: 0, iron_ore: 0, gold_ore: 0, crystal_ore: 0 };
    const oreIds = { 12: 'coal_ore', 13: 'copper_ore', 14: 'iron_ore', 15: 'gold_ore', 16: 'crystal_ore' };
    for (const chunk of g.world.chunks.values()) {
      for (let y = 2; y < 50; y++) {
        for (let i = 0; i < 256; i++) {
          const id = chunk.blocks[i | (y << 8)];
          if (id === 0) caveAir++;
          else if (oreIds[id]) ores[oreIds[id]]++;
        }
      }
    }
    return { caveAir, ores };
  });
  check('caves exist underground', under.caveAir > 500, JSON.stringify(under));
  check('coal + iron ore veins generate', under.ores.coal_ore > 20 && under.ores.iron_ore > 5, JSON.stringify(under.ores));
  check('deep rare ores generate', under.ores.gold_ore + under.ores.crystal_ore > 0, JSON.stringify(under.ores));

  console.log('COMBAT & CREATURES:');
  const combat = await page.evaluate(() => {
    const g = window.KREFT.game;
    const p = g.player.position;
    const c = g.entities.spawnCreature('grazer', p.x + 2, p.y + 1, p.z);
    const hp0 = c.health;
    c.hurt(4, null, g);
    const hp1 = c.health;
    const state = c.state;
    // second immediate hit must be blocked by i-frames
    const blocked = c.hurt(100, null, g) === false;
    // kill it after i-frames expire; step updates so the death animation
    // finishes and loot drops (disable natural spawning for a clean count)
    c.iframes = 0;
    c.hurt(100, null, g);
    for (let i = 0; i < 90; i++) { g.entities.spawnTimer = 999; g.entities.update(1 / 60, g); }
    // other creatures may have spawned naturally elsewhere — check this one
    return { hp0, hp1, state, blocked, removed: !g.entities.creatures.includes(c), drops: g.entities.drops.map(d => d.name) };
  });
  check('creature takes damage', combat.hp0 === 10 && combat.hp1 === 6, JSON.stringify(combat));
  check('hurt passive creature flees', combat.state === 'flee', combat.state);
  check('i-frames block immediate re-hit', combat.blocked, JSON.stringify(combat));
  check('death removes creature + drops loot', combat.removed && combat.drops.length >= 1, JSON.stringify(combat));

  console.log('DEATH & RESPAWN:');
  const death = await page.evaluate(() => {
    const g = window.KREFT.game;
    g.inventory.add('cobblestone', 12);
    const invBefore = g.inventory.count('cobblestone');
    g.stats.damage(100, 'test', true);
    const deadShown = !!document.querySelector('.death-title');
    const invAfter = g.inventory.count('cobblestone');
    const dropCount = g.entities.drops.length;
    g.respawn();
    return {
      invBefore, deadShown, invAfter, dropCount,
      aliveAfter: !g.stats.dead, health: g.stats.health,
      nearSpawn: Math.hypot(g.player.position.x - g.spawnPoint.x, g.player.position.z - g.spawnPoint.z) < 3
    };
  });
  check('death screen appears', death.deadShown);
  check('inventory drops on death', death.invBefore === 12 && death.invAfter === 0 && death.dropCount > 0, JSON.stringify(death));
  check('respawn restores health at spawn', death.aliveAfter && death.health === 20 && death.nearSpawn, JSON.stringify(death));

  console.log('DAY/NIGHT & HOSTILE SPAWNS:');
  const night = await page.evaluate(() => {
    const g = window.KREFT.game;
    g.sky.time = 0.75; // midnight
    g.sky.update(0.001, g.camera.position);
    const isNight = g.sky.isNight;
    const sunFactor = g.sky.sunFactor;
    // force many spawn attempts at night
    let spawned = 0;
    for (let i = 0; i < 400; i++) {
      g.entities.spawnTimer = 0;
      const before = g.entities.creatures.length;
      g.entities.trySpawns(g.player.position, g.sky.sunFactor, true, 2);
      if (g.entities.creatures.length > before) spawned++;
    }
    const hostiles = g.entities.creatures.filter(c => c.def.hostile).length;
    return { isNight, sunFactor, spawned, hostiles, clock: g.sky.clockString() };
  });
  check('midnight is night with sun 0', night.isNight && night.sunFactor === 0, JSON.stringify(night));
  check('hostiles spawn at night', night.hostiles > 0, JSON.stringify(night));
  check('clock renders', /^\d{2}:\d{2}$/.test(night.clock), night.clock);

  console.log('HUNGER & DROWNING:');
  const hunger = await page.evaluate(() => {
    const g = window.KREFT.game;
    g.stats.reset();
    g.stats.hunger = 0;
    let dmgTaken = 0;
    const h0 = g.stats.health;
    for (let i = 0; i < 300; i++) g.stats.update(0.1, { sprinting: false, moving: false, headInWater: false, gameMode: 'survival' });
    const starved = g.stats.health < h0;
    g.stats.reset();
    for (let i = 0; i < 300; i++) g.stats.update(0.1, { sprinting: false, moving: false, headInWater: true, gameMode: 'survival' });
    const drowned = g.stats.health < 20 && g.stats.air <= 0;
    // regen when fed
    g.stats.reset();
    g.stats.health = 10;
    for (let i = 0; i < 100; i++) g.stats.update(0.1, { sprinting: false, moving: false, headInWater: false, gameMode: 'survival' });
    const regenerated = g.stats.health > 10;
    return { starved, drowned, regenerated };
  });
  check('starvation damages', hunger.starved);
  check('drowning damages when air runs out', hunger.drowned);
  check('regeneration when well fed', hunger.regenerated);

  // ---- Creative world ----
  console.log('CREATIVE MODE:');
  await page.evaluate(() => window.KREFT.app.exitToMenu());
  await page.waitForTimeout(300);
  await page.click('button:has-text("Create World")');
  await page.selectOption('select', 'creative');
  await page.fill('.seed-row input', 'creativetest');
  await page.click('button.primary');
  await page.waitForTimeout(3500);

  const creative = await page.evaluate(() => {
    const g = window.KREFT.game;
    const modeOk = g.mode === 'creative';
    // no damage
    g.damagePlayer(10, 'test', null);
    const noDamage = g.stats.health === 20;
    // flying
    g.player.flying = true;
    const y0 = g.player.position.y;
    g.input.keys.add('Space');
    for (let i = 0; i < 60; i++) g.player.update(1 / 60);
    g.input.keys.delete('Space');
    const flew = g.player.position.y > y0 + 3;
    // instant break: breakTime tiny
    const bt = g.interaction.breakTime({ hardness: 3, tool: 'pickaxe', minTier: 1 });
    // creative catalog present
    window.KREFT.app.ui.inventoryUI.open('inventory');
    const hasSearch = !!document.querySelector('.creative-search');
    const gridCount = document.querySelectorAll('.creative-grid .slot').length;
    window.KREFT.app.ui.inventoryUI.close();
    return { modeOk, noDamage, flew, bt, hasSearch, gridCount };
  });
  check('creative mode set', creative.modeOk);
  check('no damage in creative', creative.noDamage);
  check('flying works', creative.flew, JSON.stringify(creative));
  check('instant block breaking', creative.bt <= 0.05, String(creative.bt));
  check('searchable creative catalog', creative.hasSearch && creative.gridCount > 50, String(creative.gridCount));

  // rapid world traversal — stress chunk streaming
  console.log('CHUNK STREAMING STRESS:');
  const stream = await page.evaluate(() => {
    const g = window.KREFT.game;
    g.player.flying = true;
    const t0 = performance.now();
    let maxLoaded = 0;
    for (let step = 0; step < 400; step++) {
      g.player.position.x += 4; // very fast travel
      g.chunkManager.update(g.player.position);
      maxLoaded = Math.max(maxLoaded, g.world.chunks.size);
    }
    const ms = performance.now() - t0;
    return { finalChunks: g.world.chunks.size, maxLoaded, ms: Math.round(ms), x: g.player.position.x };
  });
  const budget = await page.evaluate(() => {
    const g = window.KREFT.game;
    const limit = (g.chunkManager.renderDistance + 3) * 2 + 1;
    return limit * limit;
  });
  check('distant chunks unload (bounded memory)', stream.finalChunks <= budget, JSON.stringify(stream) + ' budget ' + budget);
  check('streaming 1600 blocks stays responsive', stream.ms < 30000, stream.ms + 'ms');

  const realErrors = errors.filter(e => !e.includes('WebGL') && !e.includes('AudioContext'));
  check('no page errors', realErrors.length === 0, realErrors.slice(0, 5).join(' | '));

  console.log(failures === 0 ? '\nSYSTEMS TEST PASSED' : `\n${failures} FAILURES`);
  process.exitCode = failures ? 1 : 0;
} catch (err) {
  console.error('SYSTEMS TEST ERROR:', err.stack || err);
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
