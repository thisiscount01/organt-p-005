'use strict';
const { chromium } = require('/tmp/pwproj/node_modules/playwright');
const BASE = process.env.DD_BASE || 'http://localhost:3002';
(async () => {
  const browser = await chromium.launch({ executablePath: '/tmp/pw/bpath/chromium-1117/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', m => console.log('CONSOLE:', m.type(), m.text()));
  page.on('pageerror', e => console.log('PAGEERROR:', e.message, '\n', e.stack));
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(500);
  await browser.close();
})();
