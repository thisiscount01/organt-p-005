// QA 최종검증 — 로컬 소스 기준 전체 매트릭스(원문 REQ1/REQ2 + PM 체인회귀 + QA 8종 GroupA/B + 흔한 해상도 autofocus)
// 각 케이스는 독립된 fresh page에서 실행(IO는 1회성 소진이라 페이지 공유 시 이전 케이스가 다음 케이스를 오염시킴).
const { chromium } = require("/tmp/pwproj/node_modules/playwright-core");

const BASE = process.env.QA_BASE || "http://127.0.0.1:3000";

async function freshPage(browser, viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (err) => errors.push(String(err)));
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForSelector(".depth-panel");
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(250);
  return { page, errors };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: "/tmp/pw/bpath/chromium-1117/chrome-linux/chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const out = {};

  // ── REQ1/REQ2 원문 ──
  {
    const { page, errors } = await freshPage(browser, { width: 1280, height: 900 });
    const ta = await page.$("#intake-answer");
    await ta.click();
    await page.keyboard.type("jk12", { delay: 20 });
    const req1 = await ta.evaluate((el) => el.value);
    out.req1_typed_when_focused = { value: req1, pass: req1 === "jk12" };
    await page.close();
  }
  {
    const { page, errors } = await freshPage(browser, { width: 1280, height: 900 });
    const beforeY = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("j");
    await page.waitForTimeout(350);
    const afterY = await page.evaluate(() => window.scrollY);
    const depth1 = await page.evaluate(() => document.body.getAttribute("data-depth"));
    out.req2_navigated_when_unfocused = { beforeY, afterY, depth1, pass: afterY > beforeY };
    out.req_consoleErrors = errors;
    await page.close();
  }

  // ── PM 체인 회귀: click intake → Escape(blur) → 대기 700ms → 재포커스 안 되는지 확인,
  //    그 다음 맨 위로 돌아가 j 3연발이 실제로 전진하는지 별도로 확인 ──
  {
    const { page, errors } = await freshPage(browser, { width: 1280, height: 900 });
    const ta = await page.$("#intake-answer");
    await ta.click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(900); // 420ms 지연 타이머 + IO 지연발화 + 여유
    const activeAfterEscapeWait = await page.evaluate(() => document.activeElement && document.activeElement.id);
    // 추가로 1.5초 더 대기 — "일시적으로만 blur" 패턴(늦게 도착하는 IO 최초발화)까지 잡기
    await page.waitForTimeout(1500);
    const activeAfterLongerWait = await page.evaluate(() => document.activeElement && document.activeElement.id);
    const neverRefocused = activeAfterEscapeWait !== "intake-answer" && activeAfterLongerWait !== "intake-answer";

    // 맨 위로 리셋 후 j 3연발이 실제로 전진하는지(재포커스 없이) 확인
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
    await page.waitForTimeout(200);
    const beforeY = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("j");
    await page.waitForTimeout(400);
    const afterJ1 = { y: await page.evaluate(() => window.scrollY), active: await page.evaluate(() => document.activeElement && document.activeElement.id) };
    await page.keyboard.press("j");
    await page.waitForTimeout(400);
    const afterJ2 = { y: await page.evaluate(() => window.scrollY), active: await page.evaluate(() => document.activeElement && document.activeElement.id) };
    await page.keyboard.press("j");
    await page.waitForTimeout(400);
    const afterJ3 = { y: await page.evaluate(() => window.scrollY), active: await page.evaluate(() => document.activeElement && document.activeElement.id) };

    out.pm_chain_regression = {
      activeAfterEscapeWait, activeAfterLongerWait, neverRefocused,
      beforeY, afterJ1, afterJ2, afterJ3,
      allThreeAdvanced: afterJ1.y > beforeY && afterJ2.y > afterJ1.y && afterJ3.y > afterJ2.y,
      noneRefocusedIntake: afterJ1.active !== "intake-answer" && afterJ2.active !== "intake-answer" && afterJ3.active !== "intake-answer",
      pass: neverRefocused && (afterJ1.y > beforeY && afterJ2.y > afterJ1.y && afterJ3.y > afterJ2.y) &&
            (afterJ1.active !== "intake-answer" && afterJ2.active !== "intake-answer" && afterJ3.active !== "intake-answer"),
    };
    out.pm_consoleErrors = errors;
    await page.close();
  }

  // ── QA 8종 매트릭스: 케이스마다 독립 fresh page(1회성 IO 오염 방지) ──
  for (const vp of [{ width: 1280, height: 720, label: "1280x720" }, { width: 1366, height: 768, label: "1366x768" }]) {
    // A1: click -> j
    {
      const { page, errors } = await freshPage(browser, vp);
      const ta = await page.$("#intake-answer");
      await ta.click();
      await page.keyboard.press("j");
      const v = await ta.evaluate((el) => el.value);
      out[`A1_click_j_${vp.label}`] = { value: v, pass: v === "j", consoleErrors: errors };
      await page.close();
    }
    // A2: click -> k
    {
      const { page, errors } = await freshPage(browser, vp);
      const ta = await page.$("#intake-answer");
      await ta.click();
      await page.keyboard.press("k");
      const v = await ta.evaluate((el) => el.value);
      out[`A2_click_k_${vp.label}`] = { value: v, pass: v === "k", consoleErrors: errors };
      await page.close();
    }
    // A3: Tab진입 -> 1
    {
      const { page, errors } = await freshPage(browser, vp);
      let reached = false;
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press("Tab");
        const id = await page.evaluate(() => document.activeElement && document.activeElement.id);
        if (id === "intake-answer") { reached = true; break; }
      }
      await page.keyboard.press("1");
      const ta = await page.$("#intake-answer");
      const v = await ta.evaluate((el) => el.value);
      out[`A3_tab_1_${vp.label}`] = { reached, value: v, pass: reached && v === "1", consoleErrors: errors };
      await page.close();
    }
    // A4: 스크롤완주 autofocus -> 2 (전용 fresh page, 사전 상호작용 없음)
    {
      const { page, errors } = await freshPage(browser, vp);
      const maxY = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
      let cur = 0;
      while (cur < maxY) {
        await page.mouse.wheel(0, 80);
        cur = await page.evaluate(() => window.scrollY);
        await page.waitForTimeout(60);
      }
      await page.waitForTimeout(900);
      const active = await page.evaluate(() => document.activeElement && document.activeElement.id);
      const autofocused = active === "intake-answer";
      let v = null;
      if (autofocused) {
        await page.keyboard.press("2");
        const ta = await page.$("#intake-answer");
        v = await ta.evaluate((el) => el.value);
      }
      out[`A4_scrollend_autofocus_2_${vp.label}`] = { autofocused, activeElement: active, value: v, pass: autofocused && v === "2", consoleErrors: errors };
      await page.close();
    }
  }

  // ── GroupB: 포커스 없음 depth delta (신선 페이지) ──
  {
    const { page, errors } = await freshPage(browser, { width: 1280, height: 900 });
    const seq = [];
    for (const k of ["1", "j", "k", "4"]) {
      await page.keyboard.press(k);
      await page.waitForTimeout(450);
      const d = await page.evaluate(() => document.body.getAttribute("data-depth"));
      seq.push({ key: k, depth: d });
    }
    out.groupB_depth_sequence = { seq, consoleErrors: errors };
    await page.close();
  }

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
