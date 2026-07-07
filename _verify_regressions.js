// 회귀 스윕: 키보드 점프(1~4)·reveal 트리거(IO 목적 분리 후에도 살아있는지)·인테이크 왕복.
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

  await page.goto(process.argv[2], { waitUntil: "networkidle" });
  await page.waitForSelector(".depth-panel");
  await page.waitForTimeout(400);

  // 초기 reveal(첫 화면)
  const initialRevealCount = await page.evaluate(() => document.querySelectorAll(".reveal.is-in").length);

  // 키보드 '4' → memory
  await page.click("body");
  await page.keyboard.press("4");
  await page.waitForTimeout(600);
  const after4 = await page.evaluate(() => ({
    depth: document.body.getAttribute("data-depth"),
    rail: document.querySelector("#depth-rail a[aria-current]")?.getAttribute("href") || null,
    revealCount: document.querySelectorAll(".reveal.is-in").length,
  }));

  // 키보드 '1' → surface
  await page.keyboard.press("1");
  await page.waitForTimeout(600);
  const after1 = await page.evaluate(() => ({
    depth: document.body.getAttribute("data-depth"),
    rail: document.querySelector("#depth-rail a[aria-current]")?.getAttribute("href") || null,
  }));

  // 스크롤로 전체 패널 reveal 확인(모든 panel.reveal이 결국 is-in 되는지)
  const maxScrollY = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  for (let y = 0; y <= maxScrollY; y += 200) {
    await page.evaluate((yy) => window.scrollTo({ top: yy, left: 0, behavior: "instant" }), y);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(300);
  const finalRevealCount = await page.evaluate(() => document.querySelectorAll(".reveal.is-in").length);
  const totalRevealCount = await page.evaluate(() => document.querySelectorAll(".reveal").length);

  console.log(JSON.stringify({
    initialRevealCount, after4, after1,
    finalRevealCount, totalRevealCount,
    consoleErrors: errors,
  }, null, 2));

  await browser.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
