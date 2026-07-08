// QA 재현: 키보드 depth-jump 회귀 — 두 요구 동시검증
// (1) 빈 #intake-answer에 포커스 있을 때 j/k/1 등이 타이핑되는가
// (2) 포커스 없을 때 같은 키가 depth-jump 내비게이션을 일으키는가
const { chromium } = require("/tmp/pwproj/node_modules/playwright-core");

(async () => {
  const browser = await chromium.launch({
    executablePath: "/tmp/pw/bpath/chromium-1117/chrome-linux/chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
  await page.waitForSelector(".depth-panel");
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(300);

  const results = {};

  // ── 시나리오 1: 빈 인테이크 입력칸 포커스 → j/k/1/2 타이핑돼야 함 ──
  const textarea = await page.$("#intake-answer");
  await textarea.evaluate((el) => { el.value = ""; el.scrollIntoView({block:"center"}); });
  await textarea.click();
  await page.waitForTimeout(50);
  const focusedBefore = await page.evaluate(() => document.activeElement && document.activeElement.id);
  await page.keyboard.type("jk12", { delay: 30 });
  await page.waitForTimeout(50);
  const typedValue = await textarea.evaluate((el) => el.value);
  const scrollYAfterType = await page.evaluate(() => window.scrollY);
  results.scenario1_focused_typing = {
    focusedElementWasIntake: focusedBefore === "intake-answer",
    typedValue,
    expected: "jk12",
    pass: typedValue === "jk12",
  };

  // ── 시나리오 2: 포커스 해제 → 같은 키가 depth-jump 내비게이션을 일으켜야 함 ──
  await textarea.evaluate((el) => { el.value = ""; el.blur(); });
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
  await page.waitForTimeout(200);
  const focusedAfterBlur = await page.evaluate(() => document.activeElement && document.activeElement.tagName);
  const depthBefore = await page.evaluate(() => document.body.getAttribute("data-depth"));
  const scrollYBefore = await page.evaluate(() => window.scrollY);
  await page.keyboard.press("j");
  await page.waitForTimeout(400);
  const scrollYAfterJ = await page.evaluate(() => window.scrollY);
  await page.keyboard.press("j");
  await page.waitForTimeout(400);
  const scrollYAfterJJ = await page.evaluate(() => window.scrollY);
  // "3"으로 세번째 depth-panel 직행
  await page.keyboard.press("3");
  await page.waitForTimeout(500);
  const scrollYAfter3 = await page.evaluate(() => window.scrollY);
  const depthAfter3 = await page.evaluate(() => document.body.getAttribute("data-depth"));

  results.scenario2_unfocused_navigation = {
    focusedTagWasBody: focusedAfterBlur === "BODY",
    scrollYBefore,
    scrollYAfterJ,
    scrollYAfterJJ,
    scrollYAfter3,
    depthBefore,
    depthAfter3,
    jMoved: scrollYAfterJ > scrollYBefore,
    jjMovedFurther: scrollYAfterJJ > scrollYAfterJ,
    jump3Moved: scrollYAfter3 !== scrollYAfterJJ,
    pass: (scrollYAfterJ > scrollYBefore) && (scrollYAfterJJ > scrollYAfterJ),
  };

  // ── 시나리오 3(경계): 인테이크에 이미 텍스트가 있는 상태에서 재포커스해도 타이핑 유지 ──
  await textarea.click();
  await textarea.evaluate((el) => { el.value = "hello "; });
  await page.keyboard.type("k4", { delay: 30 });
  await page.waitForTimeout(50);
  const typedValue2 = await textarea.evaluate((el) => el.value);
  results.scenario3_prefilled_typing = {
    typedValue2,
    pass: typedValue2 === "hello k4",
  };

  // ── 시나리오 4(경계): Tab으로 자연 포커스 이동 후에도 타이핑 유지 ──
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
  await page.waitForTimeout(100);
  await textarea.evaluate((el) => { el.value = ""; el.focus(); });
  await page.waitForTimeout(50);
  await page.keyboard.press("1");
  await page.waitForTimeout(50);
  const typedValue3 = await textarea.evaluate((el) => el.value);
  results.scenario4_focus_then_1 = { typedValue3, pass: typedValue3 === "1" };

  console.log(JSON.stringify({ results, consoleErrors: errors }, null, 2));

  await browser.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
