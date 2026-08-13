import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message.slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 300)); });
await page.goto('file://' + process.argv[2], { waitUntil: 'load' });
await page.waitForTimeout(1500);
console.log('menu title:', await page.textContent('.game-title').catch(() => 'MISSING'));
await browser.close();
