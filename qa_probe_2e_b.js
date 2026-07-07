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

  console.log('--- CASE A: key 3 (interpreter) then key 1 (surface) from a MID scroll position ---');
  await page.evaluate(() => window.scrollTo(0, Math.round((document.documentElement.scrollHeight - window.innerHeight) * 0.5)));
  await page.waitForTimeout(500);
  console.log('mid depth=', await page.evaluate(() => document.body.getAttribute('data-depth')));
  await page.keyboard.press('3');
  await page.waitForTimeout(1200);
  console.log('after key3 depth=', await page.evaluate(() => document.body.getAttribute('data-depth')), 'y=', await page.evaluate(() => window.scrollY));
  await page.keyboard.press('1');
  await page.waitForTimeout(1500);
  console.log('after key1 depth=', await page.evaluate(() => document.body.getAttribute('data-depth')), 'y=', await page.evaluate(() => window.scrollY));

  console.log('--- CASE B: scroll to ABSOLUTE bottom via keyboard End, then key 1 ---');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.keyboard.press('End');
  await page.waitForTimeout(1000);
  console.log('after End depth=', await page.evaluate(() => document.body.getAttribute('data-depth')), 'y=', await page.evaluate(() => window.scrollY), 'maxY=', await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight));
  await page.keyboard.press('1');
  await page.waitForTimeout(2000);
  console.log('after key1 depth=', await page.evaluate(() => document.body.getAttribute('data-depth')), 'y=', await page.evaluate(() => window.scrollY));

  console.log('--- CASE C: native scroll (wheel/mousewheel simulate via scrollTo) to native document end, then key 1 ---');
  await page.evaluate(() => window.scrollTo(0, 999999));
  await page.waitForTimeout(600);
  console.log('native-end depth=', await page.evaluate(() => document.body.getAttribute('data-depth')), 'y=', await page.evaluate(() => window.scrollY));
  await page.keyboard.press('1');
  await page.waitForTimeout(2000);
  console.log('after key1 depth=', await page.evaluate(() => document.body.getAttribute('data-depth')), 'y=', await page.evaluate(() => window.scrollY));

  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
