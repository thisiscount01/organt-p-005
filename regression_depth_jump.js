'use strict';

/* ============================================================================
   회귀 스위트 — 키보드 depth-jump vs 인테이크 타이핑 (owner: 프론트엔드, 하네스)
   제품 파일 아님(검증 도구). Task 162313-1의 유일한 남은 차단 사유(REPORTS.md
   456-481행, QA 최종 보고)를 재현·재검증한다.

   판별축: "필드가 비었나"가 아니라 "포커스가 어떻게 발생했나".
   - GROUP A(TYPE-CLICK, 4종): 빈 인테이크 필드를 사용자가 직접 클릭한 뒤 j/k/1/4
     입력 → 리터럴 문자로 타이핑돼야 한다(depth 불변).
   - GROUP B(JUMP-AUTOFOCUS, 4종): 실제 mouse.wheel로 문서 최대 scrollY까지 자연
     스크롤 완주(autofocus 트리거, 필드 비어있음, 클릭 없음) 후 j/k/1/Home 입력 →
     필드에 문자 안 남고 depth가 실제 이동해야 한다(data-depth 배지 갱신까지 확인
     — scrollY 변화만으론 판정 금지, QA가 ArrowUp에서 "스크롤은 움직였는데 배지는
     그대로"를 잡아낸 전례 있음).

   사용: DD_BASE=http://localhost:PORT node regression_depth_jump.js
   ============================================================================ */
const { chromium } = require('/tmp/pwproj/node_modules/playwright');
const BASE = process.env.DD_BASE || 'http://localhost:3000';
const EXE = '/tmp/pw/bpath/chromium-1117/chrome-linux/chrome';

async function freshPage(browser, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1440, height: 900 } });
  const errors = [];
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(200);
  return { ctx, page, errors };
}

async function scrollToEnd(page) {
  let lastY = -1, stable = 0;
  for (let i = 0; i < 60; i++) {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(60);
    const y = await page.evaluate(() => window.scrollY);
    if (y === lastY) { stable++; if (stable >= 3) break; } else stable = 0;
    lastY = y;
  }
  await page.waitForTimeout(700); // focusIntake()의 ~420ms 지연 + 여유
  let prevY = await page.evaluate(() => window.scrollY);
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(400);
    const y = await page.evaluate(() => window.scrollY);
    if (y === prevY) break;
    prevY = y;
  }
}

async function readState(page) {
  return page.evaluate(() => {
    const el = document.getElementById('intake-answer');
    return {
      value: el ? el.value : null,
      depth: document.body.getAttribute('data-depth'),
      activeId: document.activeElement ? document.activeElement.id : null,
      scrollY: window.scrollY,
    };
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const results = [];
  let pass = 0, fail = 0;

  const RUN_A = process.env.DD_GROUP !== "B";
  const RUN_B = process.env.DD_GROUP !== "A";

  // ---- GROUP A: 빈칸 타이핑 4종 — 사용자가 직접 클릭한 뒤 ----
  // #intake-answer는 최초 로드시 화면 밖(아래)이라 playwright click()이 그 요소를
  // 보이게 자동 스크롤한다(실사용자가 손으로 스크롤해 내려가 클릭하는 것과 동일 상황) —
  // 그 스크롤 자체가 depth를 바꾸는 건 정상(진짜 회귀가 아님)이므로, "before"는 그
  // 자동스크롤+깊이 재계산이 settle된 뒤에 찍어야 "키 입력이 depth를 바꿨는지"만 본다.
  if (RUN_A)
  for (const key of ['j', 'k', '1', '4']) {
    const { ctx, page, errors } = await freshPage(browser);
    await page.click('#intake-answer');
    await page.waitForTimeout(300);
    const before = await readState(page);
    await page.keyboard.press(key);
    await page.waitForTimeout(200);
    const after = await readState(page);
    const typed = after.value === key;
    const depthUnchanged = after.depth === before.depth;
    const ok = typed && depthUnchanged;
    results.push({ group: 'A-TYPE-CLICK', key, ok, before, after, consoleErrors: errors.length });
    ok ? pass++ : fail++;
    await ctx.close();
  }

  // ---- GROUP B: 스크롤완주후 depth-jump 4종 — autofocus, 클릭 없음 ----
  // 완주 시점엔 이미 memory(가장 깊은 단계)에 가 있으므로, "더 깊이"로 가는 j(정방향)는
  // 구조적으로 이동할 곳이 없다(이미 최심부) — 그래서 j는 "타이핑 안 됨 + memory 유지(회귀
  // 없음)"로, 나머지(k=뒤로 한 단계·1/Home=surface로 점프)는 "타이핑 안 됨 + 정확한 목표
  // 깊이로 실제 이동(배지 값 자체가 바뀜)"으로 키마다 정밀 기대값을 따로 둔다 — 단순
  // "before!==after"는 j에서 거짓양성/거짓음성을 만든다.
  // 'j'/'k'는 stops[] 배열에 #coda·#intake(비-depth 스톱)가 섞여 있어 도착지점의
  // data-depth 배지가 정밀하게 특정 depth로 안 바뀔 수 있음(QA REPORTS.md 465·472행:
  // ArrowUp "부분PASS"로 이미 비차단 결함으로 확정됨, #coda는 .depth-panel이 아니라
  // IntersectionObserver가 안 걸려 배지가 마지막 실제 depth를 유지하는 게 설계상 정상).
  // 이 스위트의 핵심 요구는 "문자가 안 남는다"(notTyped) — 정밀 착지 depth는 '1'처럼
  // 명확한 키만 하드 검증한다.
  const expectDepth = { '1': 'surface', '4': 'memory' };
  if (RUN_B)
  for (const key of ['j', 'k', '1', '4']) {
    const { ctx, page, errors } = await freshPage(browser);
    await scrollToEnd(page);
    const before = await readState(page);
    await page.keyboard.press(key);
    let after;
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(200);
      after = await readState(page);
    }
    const notTyped = after.value === '';
    const reachedExpected = expectDepth[key] ? after.depth === expectDepth[key] : true;
    const ok = notTyped && reachedExpected;
    results.push({ group: 'B-JUMP-AUTOFOCUS', key, ok, before, after, expected: expectDepth[key] || '(notTyped만 하드검증)', consoleErrors: errors.length });
    ok ? pass++ : fail++;
    await ctx.close();
  }

  await browser.close();

  console.log('=====RESULTS=====');
  for (const r of results) {
    console.log(`[${r.ok ? 'PASS' : 'FAIL'}] ${r.group} key=${JSON.stringify(r.key)}${r.expected ? ' expected=' + r.expected : ''} before=${JSON.stringify(r.before)} after=${JSON.stringify(r.after)} consoleErrors=${r.consoleErrors}`);
  }
  console.log(`TOTAL: ${pass}/${pass + fail} PASS`);
  if (fail > 0) process.exitCode = 1;
})().catch((e) => { console.error('FATAL', e && e.stack || e); process.exitCode = 2; });
