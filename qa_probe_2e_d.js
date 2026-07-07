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

  // reach true native bottom via wheel (realistic user path)
  let prevY = -1, y = 0;
  for (let i = 0; i < 60; i++) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(60);
    y = await page.evaluate(() => window.scrollY);
    if (y === prevY) break;
    prevY = y;
  }
  await page.waitForTimeout(700);
  console.log('settled bottom y=', y, 'depth=', await page.evaluate(() => document.body.getAttribute('data-depth')));

  // click the rail's "surface" link (one-tap nav)
  const railLink = await page.$('#depth-rail a[href="#depth-surface"]');
  console.log('rail surface link found=', !!railLink);
  if (railLink) {
    await railLink.click();
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(200);
      const d = await page.evaluate(() => document.body.getAttribute('data-depth'));
      const yy = await page.evaluate(() => window.scrollY);
      console.log(`  t+${(i+1)*200}ms depth=${d} y=${yy}`);
      if (d === 'surface') break;
    }
  }
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
