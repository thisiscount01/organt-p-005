'use strict';
const { chromium } = require('/tmp/pwproj/node_modules/playwright');
const BASE = 'https://organt-p-005-huc4.onrender.com';

(async () => {
  const browser = await chromium.launch({
    executablePath: '/tmp/pw/bpath/chromium-1117/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR:' + e));
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(400);

  // go to absolute bottom
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(600);
  console.log('at-bottom depth=', await page.evaluate(() => document.body.getAttribute('data-depth')));
  console.log('at-bottom scrollY=', await page.evaluate(() => window.scrollY));

  // press '4' (no-op, already memory)
  await page.keyboard.press('4');
  await page.waitForTimeout(300);
  console.log('after key4 depth=', await page.evaluate(() => document.body.getAttribute('data-depth')));

  // press '1' and poll depth + scrollY every 200ms for up to 5s
  const t0 = Date.now();
  await page.keyboard.press('1');
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(200);
    const depth = await page.evaluate(() => document.body.getAttribute('data-depth'));
    const y = await page.evaluate(() => window.scrollY);
    const prog = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--scroll-progress'));
    console.log(`t+${Date.now() - t0}ms depth=${depth} y=${y} prog=${prog}`);
    if (depth === 'surface') break;
  }
  console.log('errors:', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
