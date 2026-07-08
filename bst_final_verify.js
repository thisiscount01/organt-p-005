'use strict';
// 브랜드 스토리텔러 최종 인수 검증(Task 112204-1): REQ1+REQ2 동시 충족을 하나의 세션에서 재현.
// BASE는 커맨드라인 인자로 받는다(로컬 http://localhost:PORT 또는 라이브 URL).
const { chromium } = require('/tmp/pwproj/node_modules/playwright');
const BASE = process.argv[2] || 'http://localhost:3000';
const EXE = '/tmp/pw/bpath/chromium-1117/chrome-linux/chrome';

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(300);

  // ---------- REQ2 먼저: 포커스 없음(activeElement=BODY) 상태에서 depth-jump ----------
  const activeBefore = await page.evaluate(() => document.activeElement.tagName);
  const y0 = await page.evaluate(() => window.scrollY);
  await page.keyboard.press('j');
  await page.waitForTimeout(700);
  const yAfterJ = await page.evaluate(() => window.scrollY);
  await page.keyboard.press('1');
  await page.waitForTimeout(700);
  const yAfter1 = await page.evaluate(() => window.scrollY);
  await page.keyboard.press('4');
  await page.waitForTimeout(700);
  const yAfter4 = await page.evaluate(() => window.scrollY);

  // ---------- REQ1: 빈 인테이크 입력칸에 클릭으로 포커스 후 j/k/1-4 타이핑 확인 ----------
  const field = await page.$('#intake-answer, textarea#intake-answer, #intake textarea, #intake input');
  let fieldSel = null;
  if (field) fieldSel = true;
  const typedResult = await page.evaluate(() => {
    const el = document.querySelector('#intake-answer') ||
      document.querySelector('#intake textarea') ||
      document.querySelector('#intake input');
    return el ? { found: true, tag: el.tagName, id: el.id, valueBefore: el.value } : { found: false };
  });
  let typedValue = null, activeTagDuringType = null;
  if (typedResult.found) {
    await page.evaluate(() => {
      const el = document.querySelector('#intake-answer') ||
        document.querySelector('#intake textarea') ||
        document.querySelector('#intake input');
      el.value = '';
      el.focus();
    });
    activeTagDuringType = await page.evaluate(() => document.activeElement.tagName);
    await page.keyboard.press('j');
    await page.keyboard.press('k');
    await page.keyboard.press('1');
    await page.keyboard.press('2');
    await page.keyboard.press('3');
    await page.keyboard.press('4');
    typedValue = await page.evaluate(() => {
      const el = document.querySelector('#intake-answer') ||
        document.querySelector('#intake textarea') ||
        document.querySelector('#intake input');
      return el.value;
    });
    // blur 후 REQ2가 여전히 살아있는지(포커스 벗어나면 네비 복귀)
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.waitForTimeout(200);
  }

  await browser.close();

  const req2ok = (yAfterJ !== y0) && (yAfter1 === 0) && (yAfter4 > yAfter1);
  const req1ok = typedResult.found && activeTagDuringType !== 'BODY' && typedValue === 'jk1234';

  console.log('=====RESULT=====');
  console.log('BASE=', BASE);
  console.log('activeBefore(REQ2 pre)=', activeBefore);
  console.log('y0=', y0, 'yAfterJ=', yAfterJ, 'yAfter1=', yAfter1, 'yAfter4=', yAfter4);
  console.log('REQ2 pass=', req2ok);
  console.log('field found=', typedResult.found, 'tag=', typedResult.tag, 'id=', typedResult.id);
  console.log('activeTagDuringType=', activeTagDuringType, 'typedValue=', JSON.stringify(typedValue));
  console.log('REQ1 pass=', req1ok);
  console.log('consoleErrors=', errors.length, errors.slice(0, 5));
  console.log('OVERALL PASS=', req1ok && req2ok);
})().catch((e) => { console.error('FATAL', e && e.stack || e); process.exit(2); });
