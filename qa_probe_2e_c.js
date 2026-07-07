'use strict';
const { chromium } = require('/tmp/pwproj/node_modules/playwright');
const BASE = 'https://organt-p-005-huc4.onrender.com';

async function fresh(ctx) {
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(400);
  return page;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/tmp/pw/bpath/chromium-1117/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // Scenario 1: reach bottom via REAL mouse wheel (most realistic user action), then try each nav key
  for (const key of ['1', 'Home', 'ArrowUp', 'k']) {
    const page = await fresh(ctx);
    // wheel scroll in big chunks until scrollY stops increasing (true bottom, rubber-band settled)
    let prevY = -1, y = 0;
    for (let i = 0; i < 60; i++) {
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(60);
      y = await page.evaluate(() => window.scrollY);
      if (y === prevY) break;
      prevY = y;
    }
    await page.waitForTimeout(700);
    const maxY = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    const depthAtBottom = await page.evaluate(() => document.body.getAttribute('data-depth'));
    console.log(`\n[wheel-to-bottom] key=${key} settledY=${y} maxY=${maxY} depth=${depthAtBottom}`);
    await page.keyboard.press(key);
    let finalDepth, finalY;
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(200);
      finalDepth = await page.evaluate(() => document.body.getAttribute('data-depth'));
      finalY = await page.evaluate(() => window.scrollY);
      if (finalDepth === 'surface') break;
    }
    console.log(`  after ${key}: depth=${finalDepth} y=${finalY} -> ${finalDepth === 'surface' ? 'OK' : 'STUCK'}`);
    await page.close();
  }

  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
