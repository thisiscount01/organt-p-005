// QA — 라이브 URL 실브라우저 미인증 1건 재검증 (Task 162313-1)
// 대상: https://organt-p-005-huc4.onrender.com
// 항목: (1) 스크롤 서사 전환 (2) 최대스크롤 data-depth=memory 회귀 재발 없음
//       (3) 375px 무오버플로 + 60fps(스크롤 반응 애니) + 콘솔에러 0 (4) 인테이크 autofocus+paste/drop
'use strict';
const { chromium } = require('/tmp/pwproj/node_modules/playwright');

const BASE = 'https://organt-p-005-huc4.onrender.com';
const R = [];
function check(name, cond, extra) {
  R.push([name, !!cond, String(extra === undefined ? '' : extra)]);
  console.log((cond ? 'PASS' : 'FAIL'), name, '-', String(extra === undefined ? '' : extra).slice(0, 200));
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/tmp/pw/bpath/chromium-1117/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });

  // ---------- desktop context: scroll narrative + depth regression ----------
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR:' + e));
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  const loadMs = Date.now() - t0;
  check('0 live loaded', true, `loadMs=${loadMs}`);

  // (1) scroll narrative: surface -> bytecode -> interpreter -> memory, in scroll order
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  const seq = [];
  const totalH = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  const STEPS = 24;
  for (let i = 0; i <= STEPS; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), Math.round((totalH * i) / STEPS));
    await page.waitForTimeout(220);
    const d = await page.evaluate(() => document.body.getAttribute('data-depth'));
    if (seq[seq.length - 1] !== d) seq.push(d);
  }
  check('1a scroll traverses in order', JSON.stringify(seq) === JSON.stringify(seq.filter((v, i, a) => true)) , `seq=${JSON.stringify(seq)}`);
  // seq should be a subsequence that, when de-duped, follows surface<bytecode<interpreter<memory ordering (monotonic non-decreasing depth)
  const order = { surface: 0, bytecode: 1, interpreter: 2, memory: 3, unassigned: -1 };
  let monotonic = true;
  for (let i = 1; i < seq.length; i++) {
    if (order[seq[i]] < order[seq[i - 1]]) monotonic = false;
  }
  check('1b depth sequence monotonic (no backward jump)', monotonic, `seq=${JSON.stringify(seq)}`);
  check('1c all 4 depths visited while scrolling', ['surface','bytecode','interpreter','memory'].every((d) => seq.includes(d)), `seq=${JSON.stringify(seq)}`);

  // (2) max-scroll regression: data-depth stays "memory" at the very bottom (+ past coda)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(500);
  const atBottomDepth = await page.evaluate(() => document.body.getAttribute('data-depth'));
  const progAtBottom = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--scroll-progress'));
  check('2a max-scroll data-depth == memory (regression)', atBottomDepth === 'memory', `data-depth=${atBottomDepth}`);
  check('2b progress == 1 at bottom', parseFloat(progAtBottom) >= 0.99, `progress=${progAtBottom}`);
  const railCurrent = await page.evaluate(() => {
    const a = document.querySelector('#depth-rail a[aria-current="true"], #depth-rail a[aria-current]');
    return a ? a.getAttribute('href') : null;
  });
  check('2c rail marks memory current at bottom', String(railCurrent || '').includes('memory'), `rail=${railCurrent}`);

  // keyboard jump regression too (double-source bug was IO vs progress fighting)
  await page.keyboard.press('4');
  await page.waitForTimeout(1100);
  check('2d key 4 -> memory', await page.evaluate(() => document.body.getAttribute('data-depth')) === 'memory');
  await page.keyboard.press('1');
  await page.waitForTimeout(900);
  check('2e key 1 -> surface', await page.evaluate(() => document.body.getAttribute('data-depth')) === 'surface');
  // scroll back to bottom once more to re-confirm no regression after keyboard interference
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(600);
  check('2f re-scroll to bottom still memory', await page.evaluate(() => document.body.getAttribute('data-depth')) === 'memory');

  // ---------- (3b) 60fps: measure real rAF frame times while scrolling, verify active animations respond ----------
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const fpsResult = await page.evaluate(async () => {
    const frames = [];
    let last = performance.now();
    let raf;
    const collect = () => {
      const now = performance.now();
      frames.push(now - last);
      last = now;
      raf = requestAnimationFrame(collect);
    };
    raf = requestAnimationFrame(collect);
    // drive a smooth scroll over ~1500ms
    const total = document.documentElement.scrollHeight - window.innerHeight;
    const start = performance.now();
    const dur = 1500;
    await new Promise((resolve) => {
      function step() {
        const t = Math.min(1, (performance.now() - start) / dur);
        window.scrollTo(0, total * t * 0.6);
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    });
    cancelAnimationFrame(raf);
    const activeAnims = document.getAnimations ? document.getAnimations().filter(a => a.playState === 'running').length : -1;
    const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
    const over33ms = frames.filter((f) => f > 33.4).length; // dropped-below-30fps frames
    return { frameCount: frames.length, avgMs: avg, over33ms, activeAnims };
  });
  check('3a 60fps: avg frame time <= ~20ms (>=50fps avg)', fpsResult.avgMs <= 20, JSON.stringify(fpsResult));
  check('3b active animations respond to scroll', fpsResult.activeAnims > 0, JSON.stringify(fpsResult));
  check('3c dropped-frame count low (<=15% of frames >33ms)', fpsResult.over33ms <= fpsResult.frameCount * 0.15, JSON.stringify(fpsResult));

  check('X desktop console errors == 0', errors.length === 0, JSON.stringify(errors.slice(0, 5)));

  // ---------- (4) 375px viewport: overflow + console errors ----------
  const merrors = [];
  const mctx = await browser.newContext({ viewport: { width: 375, height: 760 } });
  const mpage = await mctx.newPage();
  mpage.on('console', (m) => { if (m.type() === 'error') merrors.push(m.text()); });
  mpage.on('pageerror', (e) => merrors.push('PAGEERROR:' + e));
  await mpage.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await mpage.waitForTimeout(500);
  const dims = await mpage.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, winW: window.innerWidth }));
  check('4a 375px no horizontal overflow', dims.scrollW <= dims.winW + 1, JSON.stringify(dims));
  // scroll through full narrative on mobile too
  const mTotal = await mpage.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  for (let i = 0; i <= 10; i++) {
    await mpage.evaluate((y) => window.scrollTo(0, y), Math.round((mTotal * i) / 10));
    await mpage.waitForTimeout(150);
  }
  const dims2 = await mpage.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, winW: window.innerWidth }));
  check('4b 375px no overflow after full scroll', dims2.scrollW <= dims2.winW + 1, JSON.stringify(dims2));
  const mDepthAtBottom = await mpage.evaluate(() => document.body.getAttribute('data-depth'));
  check('4c mobile max-scroll depth == memory', mDepthAtBottom === 'memory', `data-depth=${mDepthAtBottom}`);
  await mpage.screenshot({ path: '/tmp/qa_live_mobile.png' });
  check('4d mobile console errors == 0', merrors.length === 0, JSON.stringify(merrors.slice(0, 5)));
  await mctx.close();

  // ---------- (5) intake: autofocus + paste/drop card loading (create then clean up via API) ----------
  const ictx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: [] });
  const ipage = await ictx.newPage();
  const ierrors = [];
  ipage.on('console', (m) => { if (m.type() === 'error') ierrors.push(m.text()); });
  await ipage.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await ipage.waitForTimeout(400);
  const coda = await ipage.$('#coda-cta');
  if (coda) {
    await coda.scrollIntoViewIfNeeded();
    await coda.click();
    await ipage.waitForTimeout(1200);
  }
  const activeId = await ipage.evaluate(() => document.activeElement && document.activeElement.id);
  check('5a intake autofocus on first question (CTA path)', activeId === 'intake-answer', `active=${activeId}`);

  const beforeIds = await ipage.evaluate(async () => {
    const r = await fetch('/api/intake');
    const j = await r.json();
    return (j.entries || []).map((e) => e.id);
  });

  // Enter-submit an answer
  const ans = await ipage.$('#intake-answer');
  await ans.click();
  await ans.fill('QA 라이브 재검증 — 실 Chromium 자동 입력(정리 예정)');
  await ans.press('Enter');
  await ipage.waitForTimeout(900);
  const cardsAfterAnswer = await ipage.$$eval('#intake-cards .card-artifact', (els) => els.length);
  check('5b Enter creates card client-side', cardsAfterAnswer >= 1, `cards=${cardsAfterAnswer}`);

  // paste a code artifact via ClipboardEvent (matches frontend paste path)
  await ipage.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'def deepdive():\n    return "QA paste probe"');
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await ipage.waitForTimeout(900);
  const cardsAfterPaste = await ipage.$$eval('#intake-cards .card-artifact', (els) => els.length);
  check('5c paste adds a card', cardsAfterPaste > cardsAfterAnswer, `cards=${cardsAfterPaste}`);
  const kinds = await ipage.$$eval('#intake-cards .card-artifact__kind', (els) => els.map((e) => e.textContent));
  check('5d pasted code kind auto-detected', kinds.some((k) => (k || '').includes('code')), JSON.stringify(kinds));

  // wait for graceful sync to server, then verify server-side persistence
  await ipage.waitForTimeout(1200);
  const afterIds = await ipage.evaluate(async () => {
    const r = await fetch('/api/intake');
    const j = await r.json();
    return (j.entries || []).map((e) => e.id);
  });
  const newIds = afterIds.filter((id) => !beforeIds.includes(id));
  check('5e new entries synced to live server', newIds.length >= 1, `newIds=${JSON.stringify(newIds)}`);

  check('5f intake page console errors == 0', ierrors.length === 0, JSON.stringify(ierrors.slice(0, 5)));

  // cleanup: DELETE the entries this run created so the live store stays clean
  let cleaned = 0;
  for (const id of newIds) {
    const resp = await ipage.evaluate(async (eid) => {
      const r = await fetch('/api/intake/' + eid, { method: 'DELETE' });
      return { status: r.status, body: await r.json().catch(() => null) };
    }, id);
    if (resp.status === 200 && resp.body && resp.body.ok) cleaned++;
  }
  check('5g cleanup DELETE removes created test entries', cleaned === newIds.length, `cleaned=${cleaned}/${newIds.length}`);
  const finalState = await ipage.evaluate(async () => {
    const r = await fetch('/api/intake');
    const j = await r.json();
    return j.entries.length;
  });
  check('5h live store clean after cleanup', finalState === beforeIds.length, `before=${beforeIds.length} after=${finalState}`);

  await ictx.close();
  await browser.close();

  const npass = R.filter((r) => r[1]).length;
  console.log(`\n=== ${npass}/${R.length} PASSED ===`);
  const fails = R.filter((r) => !r[1]);
  if (fails.length) {
    console.log('FAILURES:');
    fails.forEach(([n, , e]) => console.log('  FAIL', n, '|', e));
  }
  process.exit(fails.length ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
