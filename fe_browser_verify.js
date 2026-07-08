// Task 112204-1 잔여 결함 재현: focusIntake()의 지연 setTimeout이 핸들 미저장으로 방치돼
// Escape blur/depth-jump 이동 뒤 420ms가 지나면 무조건 발동해 intake-answer로 강제
// 재포커스 -> depth-jump가 j/k/1-4 첫 키 이후 무력화됨(PM 실사용 체인 재현으로 확정).
// 수용기준(둘 다 동시 충족, keyboard.press만 사용 — .value 직접대입 금지):
//   (1) 빈 #intake-answer에 포커스 있을 때 j/k/1-4는 여전히 글자로 타이핑됨.
//   (2) 포커스가 필드 밖일 때 같은 키는 depth-jump — 필드를 벗어나면(Escape blur 또는
//       depth-jump 이동) 나중에 예약된 지연 포커스가 되살아나 뺏어가지 않음.
const { chromium } = require('/tmp/pwproj/node_modules/playwright');
const { spawn } = require('child_process');

function activeInfo() {
  return document.activeElement
    ? { tag: document.activeElement.tagName, id: document.activeElement.id }
    : null;
}

(async () => {
  const env = { ...process.env, PORT: '3123' }; delete env.PYTHONPATH;
  const srv = spawn('node', ['server.js'], { cwd: '/tmp/ddp_v2', env });
  await new Promise(r => setTimeout(r, 1200));

  let ok = true;
  const log = [];
  const check = (name, cond, extra) => {
    ok = ok && !!cond;
    log.push(`${cond ? 'PASS' : 'FAIL'} ${name} - ${extra || ''}`);
  };

  const errs = [];
  const browser = await chromium.launch({
    executablePath: '/tmp/pw/bpath/chromium-1117/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR:' + e.message));
  await page.goto('http://localhost:3123/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // ===== 체인 A: 클릭(포커스) -> Escape(blur) -> 420ms+ 대기 -> j/k/1-4 연속 3회+ =====
  await page.click('#intake-answer');
  let active = await page.evaluate(activeInfo);
  check('A0 click focuses intake', active && active.id === 'intake-answer', JSON.stringify(active));

  await page.keyboard.press('Escape');
  await page.waitForTimeout(50);
  active = await page.evaluate(activeInfo);
  check('A1 escape blurs', !(active && active.id === 'intake-answer'), JSON.stringify(active));

  await page.waitForTimeout(600); // 원래 420ms 지연 포커스가 발동했을 시점 통과
  active = await page.evaluate(activeInfo);
  check('A2 after 420ms+ still not refocused', !(active && active.id === 'intake-answer'), JSON.stringify(active));

  for (const key of ['j', 'k', '1', '2', '3', '4', 'j', 'k']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(500); // smooth-scroll 안정화
    const depth = await page.evaluate(() => document.body.getAttribute('data-depth'));
    active = await page.evaluate(activeInfo);
    const stolen = active && active.id === 'intake-answer';
    check(`A3 key(${key}) no refocus-steal`, !stolen, `active=${JSON.stringify(active)} depth=${depth}`);
  }

  // ===== 체인 B: 클릭 -> 빈 칸에 j/k/1/4 타이핑 -> value 축적 =====
  await page.goto('http://localhost:3123/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.click('#intake-answer');
  active = await page.evaluate(activeInfo);
  check('B0 click focuses intake', active && active.id === 'intake-answer', JSON.stringify(active));

  for (const key of ['j', 'k', '1', '4']) await page.keyboard.press(key);
  await page.waitForTimeout(100);
  const val = await page.$eval('#intake-answer', el => el.value);
  check("B1 typed value accumulates 'jk14'", val === 'jk14', JSON.stringify(val));
  active = await page.evaluate(activeInfo);
  check('B2 still focused after typing', active && active.id === 'intake-answer', JSON.stringify(active));

  // ===== 체인 C: IO autofocus 예약 중 depth-jump로 먼저 이동 -> 나중에 안 뺏김 =====
  await page.goto('http://localhost:3123/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  let lastY = -1, stable = 0;
  for (let i = 0; i < 60; i++) {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(50);
    const y = await page.evaluate(() => window.scrollY);
    if (y === lastY) { stable++; if (stable >= 3) break; } else stable = 0;
    lastY = y;
  }
  await page.keyboard.press('1'); // 예약된 420ms 타이머가 아직 대기 중일 시점에 명시적 이동
  await page.waitForTimeout(700); // 원래 예약 시각을 지나도록 대기
  active = await page.evaluate(activeInfo);
  check('C0 goto() cancels pending autofocus timer', !(active && active.id === 'intake-answer'), JSON.stringify(active));

  check('Z no console errors during whole run', errs.length === 0, JSON.stringify(errs));

  await browser.close();
  srv.kill();

  console.log(log.join('\n'));
  console.log('=====RESULTS=====');
  console.log('OVERALL', ok ? 'PASS' : 'FAIL');
  console.log('CONSOLE_ERRORS', JSON.stringify(errs));
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(1); });
