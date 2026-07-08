'use strict';
const { chromium } = require('/tmp/pwproj/node_modules/playwright');
const EXE = '/tmp/pw/bpath/chromium-1117/chrome-linux/chrome';
const BASE = 'http://localhost:5988/';

async function freshPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(300);
  return { ctx, page, errors };
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const out = {};

  // gestureFocused/isEmptyTextField 잔존 검사
  {
    const { ctx, page } = await freshPage(browser);
    const appjs = await page.evaluate(() => fetch('/app.js').then((r) => r.text()));
    out.gestureCount = (appjs.match(/gestureFocused/g) || []).length;
    out.emptyFieldCount = (appjs.match(/isEmptyTextField/g) || []).length;
    await ctx.close();
  }

  // REQ1: 클릭으로 빈 인테이크 필드에 포커스 -> j k 1 2 3 4 타이핑
  {
    const { ctx, page, errors } = await freshPage(browser);
    const ans = page.locator('#intake-answer');
    await ans.scrollIntoViewIfNeeded();
    await ans.click();
    await page.waitForTimeout(150);
    for (const ch of 'jk1234') await page.keyboard.press(ch);
    out.req1_clickFocus_value = await ans.inputValue();
    out.req1_consoleErrors = errors.length;
    await ctx.close();
  }

  // REQ1b: 스크롤완주(autofocus)로 빈 인테이크 필드 도달 -> 여전히 타이핑돼야
  {
    const { ctx, page, errors } = await freshPage(browser);
    let lastY = -1, stable = 0;
    for (let i = 0; i < 60; i++) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(60);
      const y = await page.evaluate(() => window.scrollY);
      if (y === lastY) { stable++; if (stable >= 3) break; } else stable = 0;
      lastY = y;
    }
    await page.waitForTimeout(800); // focusIntake 420ms setTimeout + settle
    const active = await page.evaluate(() => document.activeElement && document.activeElement.id);
    const valBefore = await page.locator('#intake-answer').inputValue();
    for (const ch of 'jk12') await page.keyboard.press(ch);
    const valAfter = await page.locator('#intake-answer').inputValue();
    out.req1b_autofocus_activeId = active;
    out.req1b_valBeforeType = valBefore;
    out.req1b_valAfterType = valAfter;
    out.req1b_consoleErrors = errors.length;
    await ctx.close();
  }

  // REQ2: 포커스 없음(fresh page, body) -> j 로 depth 이동
  {
    const { ctx, page, errors } = await freshPage(browser);
    const depth0 = await page.evaluate(() => document.body.getAttribute('data-depth'));
    const active0 = await page.evaluate(() => document.activeElement && document.activeElement.tagName);
    await page.keyboard.press('j');
    await page.waitForTimeout(900);
    const depth1 = await page.evaluate(() => document.body.getAttribute('data-depth'));
    out.req2_j_depth0 = depth0;
    out.req2_j_active0 = active0;
    out.req2_j_depth1 = depth1;
    out.req2_j_changed = depth0 !== depth1;
    out.req2_consoleErrors = errors.length;
    await ctx.close();
  }

  // REQ2b: 포커스 없음 -> '4' 로 마지막(인테이크)까지 depth-jump, 그 뒤 배지 변화 확인
  {
    const { ctx, page, errors } = await freshPage(browser);
    const depth0 = await page.evaluate(() => document.body.getAttribute('data-depth'));
    await page.keyboard.press('4');
    await page.waitForTimeout(900);
    const depth1 = await page.evaluate(() => document.body.getAttribute('data-depth'));
    out.req2b_4_depth0 = depth0;
    out.req2b_4_depth1 = depth1;
    out.req2b_4_changed = depth0 !== depth1;
    out.req2b_consoleErrors = errors.length;
    await ctx.close();
  }

  // REQ2c: Tab으로 필드 진입 후 다시 blur된 상태(포커스 없음) -> k 로 depth-jump
  {
    const { ctx, page, errors } = await freshPage(browser);
    await page.locator('#intake-answer').focus();
    await page.waitForTimeout(100);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.waitForTimeout(100);
    const depth0 = await page.evaluate(() => document.body.getAttribute('data-depth'));
    await page.keyboard.press('j');
    await page.waitForTimeout(900);
    const depth1 = await page.evaluate(() => document.body.getAttribute('data-depth'));
    out.req2c_afterTabBlur_depth0 = depth0;
    out.req2c_afterTabBlur_depth1 = depth1;
    out.req2c_changed = depth0 !== depth1;
    out.req2c_consoleErrors = errors.length;
    await ctx.close();
  }

  // REQ1c: Tab으로 진입해 포커스가 필드 안(비어있음)인 상태에서 j/1 타이핑돼야
  {
    const { ctx, page, errors } = await freshPage(browser);
    await page.locator('#intake-answer').focus();
    await page.waitForTimeout(100);
    for (const ch of 'j1') await page.keyboard.press(ch);
    out.req1c_tabFocus_value = await page.locator('#intake-answer').inputValue();
    out.req1c_consoleErrors = errors.length;
    await ctx.close();
  }

  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error('FATAL', e && e.stack || e); process.exit(2); });
