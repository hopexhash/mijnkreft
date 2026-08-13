// Verifies the no-pointer-lock fallback: look, mine, place, and menus must
// all work with a visible cursor (as in sandboxed iframes / artifacts).
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5199 }, logLevel: 'silent' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

// simulate a sandbox that blocks pointer lock
await page.addInitScript(() => {
  Element.prototype.requestPointerLock = function () {
    setTimeout(() => document.dispatchEvent(new Event('pointerlockerror')), 0);
    return Promise.reject(new DOMException('sandbox', 'SecurityError'));
  };
});

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name, ok ? '' : detail);
  if (!ok) failures++;
};

await page.goto('http://localhost:5199/', { waitUntil: 'load' });
await page.waitForTimeout(900);
await page.click('button:has-text("Create World")');
await page.fill('.seed-row input', 'fallbacktest');
await page.click('button.primary');
await page.waitForTimeout(4000);

check('fallback mode engaged', await page.evaluate(() => window.KREFT.app.ui.lockFallback === true));

// --- look around with plain mouse movement ---
const yaw0 = await page.evaluate(() => window.KREFT.game.player.yaw);
await page.mouse.move(640, 400);
await page.mouse.move(900, 400, { steps: 10 });
await page.waitForTimeout(300);
const yaw1 = await page.evaluate(() => window.KREFT.game.player.yaw);
check('mouse look works without lock', Math.abs(yaw1 - yaw0) > 0.05, `yaw ${yaw0} -> ${yaw1}`);

// --- clicks reach the game: hold left to mine the block in the crosshair ---
await page.evaluate(() => {
  const g = window.KREFT.game;
  g.player.pitch = -1.2; // aim at the ground
  g.player.yaw = 0;
  g.input.mouseDX = 0; g.input.mouseDY = 0;
  g.player.update(0.016);
});
const targetBefore = await page.evaluate(() => {
  const g = window.KREFT.game;
  g.interaction.update(0.001);
  return g.interaction.target ? { ...g.interaction.target } : null;
});
check('crosshair targets a block', !!targetBefore, JSON.stringify(targetBefore));

await page.mouse.move(640, 400);
await page.mouse.down({ button: 'left' });
const leftDown = await page.evaluate(() => window.KREFT.game.input.leftDown);
check('left mousedown registers', leftDown === true);

// drive deterministic update steps while the button is held
const mineResult = await page.evaluate((t) => {
  const g = window.KREFT.game;
  g.player.pitch = -1.2; g.player.yaw = 0;
  for (let i = 0; i < 40; i++) g.interaction.update(0.1);
  return { nowAir: g.world.getBlockId(t.x, t.y, t.z) === 0 };
}, targetBefore);
await page.mouse.up({ button: 'left' });
check('holding left mines the block', mineResult.nowAir, JSON.stringify(mineResult));

// --- right-click places a block (from fresh ground; the mining test above
// digs a shaft the player falls into) ---
const placed = await page.evaluate(() => {
  const g = window.KREFT.game;
  const p = g.player.position;
  const nx = Math.floor(p.x) + 6, nz = Math.floor(p.z) + 6;
  g.player.teleport(nx + 0.5, g.world.surfaceHeight(nx, nz) + 1.2, nz + 0.5);
  g.inventory.slots[0] = { name: 'planks', count: 5 };
  g.inventory.selected = 0;
  g.player.pitch = -1.0; g.player.yaw = 0;
  g.interaction.placeCooldown = 0;
  g.interaction.update(0.001);
  return !!g.interaction.target;
});
await page.waitForTimeout(400); // let real frames settle physics + retarget
check('target for placement', placed);
await page.mouse.down({ button: 'right' });
await page.mouse.up({ button: 'right' });
await page.waitForTimeout(200);
const placedOk = await page.evaluate(() => window.KREFT.game.inventory.slots[0]?.count !== 5);
check('right click places a block', placedOk);

// --- Esc opens pause, menu buttons clickable, resume returns to game ---
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('Esc opens pause in fallback', await page.evaluate(() => window.KREFT.app.ui.pauseOpen === true));
await page.click('button:has-text("Resume")');
await page.waitForTimeout(300);
check('Resume works', await page.evaluate(() => window.KREFT.app.ui.pauseOpen === false && !window.KREFT.game.paused));

// --- inventory modal still clickable ---
await page.keyboard.press('KeyE');
await page.waitForTimeout(400);
check('inventory opens', await page.evaluate(() => window.KREFT.app.ui.inventoryUI.isOpen));
await page.keyboard.press('KeyE');
await page.waitForTimeout(200);

console.log(failures ? `\n${failures} FAILURES` : '\nFALLBACK TEST PASSED');
process.exitCode = failures ? 1 : 0;
await browser.close();
await server.close();
