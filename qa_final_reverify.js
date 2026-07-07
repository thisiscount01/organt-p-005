'use strict';
// QA final re-verification for Task 162313-1:
// (A) fresh page -> real mouse wheel scroll to document max scrollY (triggers #intake autofocus)
// (B) at that state, press each of '1' / 'Home' / 'ArrowUp' / 'k' individually (fresh page per key)
//     and check depth actually changes (scroll moves off 0 / data-depth updates)
// (C) spot-check regressions: 24-step monotonic scroll, 375px overflow=0, console errors=0, 60fps
const { chromium } = require('/tmp/pwproj/node_modules/playwright');
const BASE = 'https://organt-p-005-huc4.onrender.com';
const EXE = '/tmp/pw/bpath/chromium-1117/chrome-linux/chrome';

async function freshScrolledPage(browser, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1440, height: 900 } });
  const errors = [];
  const page = await ctx.newPage();
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(300);
  // REAL mouse wheel scroll (not scrollTo) down to the document's actual max scrollY
  let lastY = -1, stableCount = 0;
  for (let i = 0; i < 60; i++) {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(60);
    const y = await page.evaluate(() => window.scrollY);
    if (y === lastY) { stableCount++; if (stableCount >= 3) break; } else { stableCount = 0; }
    lastY = y;
  }
  await page.waitForTimeout(700); // past the ~420ms autofocus delay
  // extra settle: wait until scrollY is stable across two 400ms-spaced reads (kill residual momentum)
  let prevY = await page.evaluate(() => window.scrollY);
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(400);
    const y = await page.evaluate(() => window.scrollY);
    if (y === prevY) break;
    prevY = y;
  }
  const settled = await page.evaluate(() => ({
    scrollY: window.scrollY,
    maxY: document.documentElement.scrollHeight - window.innerHeight,
    depth: document.body.getAttribute('data-depth'),
    active: document.activeElement ? (document.activeElement.tagName + '#' + document.activeElement.id) : null,
  }));
  return { ctx, page, errors, settled };
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const results = {};

  // ---------- CONTROL: no keypress at all, just observe whether scrollY drifts on its own ----------
  {
    const { ctx, page, errors, settled } = await freshScrolledPage(browser);
    const before = settled;
    const series = [];
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(200);
      const s = await page.evaluate(() => window.scrollY);
      series.push(s);
    }
    console.log(`CONTROL(no keypress) beforeScrollY=${before.scrollY} series=[${series.join(',')}] consoleErrors=${errors.length}`);
    await ctx.close();
  }

  // ---------- (A)+(B): one fresh page per key ----------
  for (const key of ['1', 'Home', 'ArrowUp', 'k']) {
    const { ctx, page, errors, settled } = await freshScrolledPage(browser);
    const before = settled;
    await page.keyboard.press(key);
    // wait a fixed long window for any smooth-scroll navigation to fully complete
    // (do NOT break early on first tiny movement -- residual wheel momentum can
    // cause a small scrollY drift that is NOT real depth navigation)
    let after, series = [];
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(200);
      after = await page.evaluate(() => ({
        scrollY: window.scrollY,
        depth: document.body.getAttribute('data-depth'),
        activeVal: document.activeElement && (document.activeElement.tagName === 'TEXTAREA') ? document.activeElement.value : null,
      }));
      series.push(after.scrollY);
    }
    results[key] = { before, after, errors, series, depthChanged: after.depth !== before.depth };
    await ctx.close();
  }

  // ---------- SUPPLEMENTARY: does documented Escape-first workaround restore '1'/'k' jump? ----------
  {
    const { ctx, page, errors, settled } = await freshScrolledPage(browser);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const afterEsc = await page.evaluate(() => ({
      depth: document.body.getAttribute('data-depth'),
      active: document.activeElement ? document.activeElement.tagName : null,
    }));
    await page.keyboard.press('1');
    await page.waitForTimeout(1200);
    const afterOne = await page.evaluate(() => ({
      scrollY: window.scrollY, depth: document.body.getAttribute('data-depth'),
    }));
    console.log(`SUPPLEMENTARY Escape-then-1: afterEscActive=${afterEsc.active} afterEscDepth=${afterEsc.depth} | after1 scrollY=${afterOne.scrollY} depth=${afterOne.depth} | consoleErrors=${errors.length}`);
    await ctx.close();
  }

  // ---------- (C) regression spot-check on a fresh page ----------
  const regCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const regErrors = [];
  const regPage = await regCtx.newPage();
  regPage.on('console', (m) => { if (m.type() === 'error') regErrors.push(m.text()); });
  regPage.on('pageerror', (e) => regErrors.push('pageerror: ' + e.message));
  await regPage.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await regPage.waitForTimeout(300);

  // 24-step monotonic scroll: depth should never regress in the surface->bytecode->interpreter->memory order
  const order = ['surface', 'bytecode', 'interpreter', 'memory'];
  const seenIdx = [];
  for (let i = 0; i < 24; i++) {
    await regPage.mouse.wheel(0, 300);
    await regPage.waitForTimeout(80);
    const d = await regPage.evaluate(() => document.body.getAttribute('data-depth'));
    const idx = order.indexOf(d);
    if (idx >= 0) seenIdx.push(idx);
  }
  let monotonic = true;
  for (let i = 1; i < seenIdx.length; i++) if (seenIdx[i] < seenIdx[i - 1]) monotonic = false;
  const visitedAll = order.every((_, i) => seenIdx.includes(i));

  // 375px overflow check
  const mobCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const mobPage = await mobCtx.newPage();
  const mobErrors = [];
  mobPage.on('console', (m) => { if (m.type() === 'error') mobErrors.push(m.text()); });
  await mobPage.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await mobPage.waitForTimeout(300);
  const overflow1 = await mobPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await mobPage.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await mobPage.waitForTimeout(300);
  const overflow2 = await mobPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

  // 60fps spot check: measure rAF frame times during a scripted scroll burst
  await regPage.evaluate(() => window.scrollTo(0, 0));
  await regPage.waitForTimeout(200);
  const fps = await regPage.evaluate(() => new Promise((resolve) => {
    const frames = [];
    let last = performance.now();
    let raf;
    const tick = (t) => {
      frames.push(t - last);
      last = t;
      if (frames.length < 90) raf = requestAnimationFrame(tick);
      else resolve(frames);
    };
    raf = requestAnimationFrame(tick);
    let y = 0;
    const scroller = setInterval(() => { y += 40; window.scrollTo(0, y); if (y > 4000) clearInterval(scroller); }, 16);
  }));
  const avgFrame = fps.reduce((a, b) => a + b, 0) / fps.length;
  const over33 = fps.filter((f) => f > 33).length;

  await ctx0Close();
  async function ctx0Close() { await regCtx.close(); await mobCtx.close(); }

  await browser.close();

  console.log('=====RESULTS-BEGIN=====');
  for (const [k, v] of Object.entries(results)) {
    console.log(`KEY=${JSON.stringify(k)} beforeScrollY=${v.before.scrollY} beforeDepth=${v.before.depth} beforeActive=${v.before.active} | afterScrollY=${v.after.scrollY} afterDepth=${v.after.depth} afterActiveVal=${JSON.stringify(v.after.activeVal)} | depthChanged=${v.depthChanged} | series=[${v.series.join(',')}] | consoleErrors=${v.errors.length}`);
  }
  console.log(`REGRESSION scrollOrderSeen=[${seenIdx.join(',')}] monotonic=${monotonic} visitedAllFour=${visitedAll}`);
  console.log(`REGRESSION overflow375_top=${overflow1} overflow375_afterFullScroll=${overflow2}`);
  console.log(`REGRESSION avgFrameMs=${avgFrame.toFixed(2)} framesOver33ms=${over33} totalFrames=${fps.length}`);
  console.log(`REGRESSION consoleErrors=${regErrors.length} mobileConsoleErrors=${mobErrors.length}`);
  console.log('=====RESULTS-END=====');
})().catch((e) => { console.error('FATAL', e && e.stack || e); process.exit(2); });
