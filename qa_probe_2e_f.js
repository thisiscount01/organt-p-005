'use strict';
// probe touch
const { chromium } = require('/tmp/pwproj/node_modules/playwright');
const BASE = 'https://organt-p-005-huc4.onrender.com';

(async () => {
  const browser = await chromium.launch({
    executablePath: '/tmp/pw/bpath/chromium-1117/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // FRESH page, PURE keyboard journey: End (jump to last stop, as a keyboard-only user exploring shortcuts would try), then try to come back to surface with '1'
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(400);
  console.log('initial activeElement=', await page.evaluate(() => document.activeElement && document.activeElement.tagName));

  await page.keyboard.press('End');
  // wait past the 420ms autofocus delay
  await page.waitForTimeout(1000);
  console.log('after End: depth=', await page.evaluate(() => document.body.getAttribute('data-depth')),
    'activeElement=', await page.evaluate(() => { const a = document.activeElement; return a ? a.tagName + '#' + a.id : null; }));

  await page.keyboard.press('1');
  let finalDepth;
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(200);
    finalDepth = await page.evaluate(() => document.body.getAttribute('data-depth'));
    if (finalDepth === 'surface') break;
  }
  console.log('after key 1 (fresh, pure-keyboard End->1): depth=', finalDepth, finalDepth === 'surface' ? 'OK' : 'STUCK (keyboard trap reproduced)');
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
