'use strict';
const { chromium } = require('/tmp/pwproj/node_modules/playwright');
const BASE = 'https://organt-p-005-huc4.onrender.com';

(async () => {
  const browser = await chromium.launch({
    executablePath: '/tmp/pw/bpath/chromium-1117/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(400);

  let prevY = -1, y = 0;
  for (let i = 0; i < 60; i++) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(60);
    y = await page.evaluate(() => window.scrollY);
    if (y === prevY) break;
    prevY = y;
  }
  await page.waitForTimeout(700);
  const active = await page.evaluate(() => {
    const a = document.activeElement;
    return a ? { tag: a.tagName, id: a.id, cls: a.className } : null;
  });
  console.log('settled y=', y, 'activeElement=', JSON.stringify(active));

  // now blur it explicitly and retry key '1'
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
  await page.waitForTimeout(200);
  const active2 = await page.evaluate(() => document.activeElement && document.activeElement.tagName);
  console.log('after blur activeElement=', active2);
  await page.keyboard.press('1');
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(200);
    const d = await page.evaluate(() => document.body.getAttribute('data-depth'));
    console.log(`  t+${(i+1)*200}ms depth=${d}`);
    if (d === 'surface') break;
  }
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
