// QA 재현 결함 검증: depths-root 끝까지 스크롤 → 코다까지 150px 추가 스크롤 →
// body[data-depth]가 memory 유지(surface로 역행 안 함) 확인.
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

  await page.goto("http://127.0.0.1:3123/", { waitUntil: "networkidle" });
  await page.waitForSelector(".depth-panel");
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(300); // 폰트 로드로 인한 레이아웃 shift 안정화

  // depths-root 끝까지 스크롤(마지막 패널 하단이 뷰포트 하단과 일치 = progress 1.0)
  const endY = await page.evaluate(() => {
    const root = document.getElementById("depths-root");
    return root.offsetTop + root.offsetHeight - window.innerHeight;
  });
  // 실제 사용자 스크롤과 등가로 만들기 위해 IO 임계값 교차가 누락되지 않도록 잘게 나눠 스크롤
  // (한 번에 점프하면 IntersectionObserver가 중간 상태를 관측 못 해 재현이 왜곡될 수 있음).
  async function scrollStepsTo(targetY) {
    let cur = await page.evaluate(() => window.scrollY);
    const step = 80;
    while (cur < targetY) {
      cur = Math.min(targetY, cur + step);
      await page.evaluate((y) => window.scrollTo({ top: y, left: 0, behavior: "instant" }), cur);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(300);
  }

  await scrollStepsTo(endY);
  const atEndScrollY = await page.evaluate(() => window.scrollY);
  const atEndDepth = await page.evaluate(() => document.body.getAttribute("data-depth"));
  const atEndProgress = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--scroll-progress").trim());

  async function readState() {
    return {
      depth: await page.evaluate(() => document.body.getAttribute("data-depth")),
      progress: await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--scroll-progress").trim()),
      railCurrent: await page.evaluate(() => {
        const a = document.querySelector("#depth-rail a[aria-current]");
        return a ? a.getAttribute("href") : null;
      }),
      announcer: await page.evaluate(() => document.getElementById("depth-announcer").textContent),
      codaHidden: await page.evaluate(() => document.getElementById("coda").hidden),
      scrollY: await page.evaluate(() => window.scrollY),
    };
  }

  // 코다까지 정확히 150px 추가 스크롤(요청 재현 시나리오 그대로)
  await scrollStepsTo(atEndScrollY + 150);
  const at150 = await readState();

  // 모든 depth-panel이 뷰포트 밖으로 완전히 나가는 지점까지 추가 스크롤(맨 아래 패널 높이 넘어까지) —
  // "패널 4개 전부 visible=0" 조건을 확실히 만족시켜 회귀의 근본 조건을 직접 관통 검증.
  const maxScrollY = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  await scrollStepsTo(maxScrollY);
  const atMax = await readState();

  console.log(JSON.stringify({
    endY, atEndScrollY, atEndDepth, atEndProgress, maxScrollY,
    at150px: at150,
    atMaxScroll: atMax,
    consoleErrors: errors,
  }, null, 2));

  await browser.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
