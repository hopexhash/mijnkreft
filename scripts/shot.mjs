// Screenshot helper: boots the game, creates a world, waits, screenshots.
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const server = await createServer({ server: { port: 5199 }, logLevel: 'silent' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:5199/', { waitUntil: 'load' });
await page.waitForTimeout(1000);
await page.screenshot({ path: 'shots/menu.png' });
await page.click('button:has-text("Create World")');
await page.waitForTimeout(200);
await page.screenshot({ path: 'shots/create.png' });
await page.fill('.seed-row input', 'screenshot1');
await page.click('button.primary');
await page.waitForTimeout(9000); // let plenty of chunks mesh
// look slightly down and to the side for a nicer angle
await page.evaluate(() => {
  const g = window.KREFT.game;
  g.player.yaw = 0.7; g.player.pitch = -0.15;
  g.player.update(0.016);
  g.render();
});
await page.screenshot({ path: 'shots/world.png' });
// open inventory
await page.evaluate(() => {
  const g = window.KREFT.game;
  g.inventory.add('log', 12); g.inventory.add('cobblestone', 30); g.inventory.add('timber_pickaxe', 1);
  window.KREFT.app.ui.inventoryUI.open('inventory');
  window.KREFT.app.ui.refreshHotbar();
});
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/inventory.png' });
// night
await page.evaluate(() => {
  window.KREFT.app.ui.inventoryUI.close();
  const g = window.KREFT.game;
  g.sky.time = 0.72; // deep night
});
await page.waitForTimeout(1200);
await page.evaluate(() => window.KREFT.game.render());
await page.screenshot({ path: 'shots/night.png' });
await browser.close(); await server.close();
