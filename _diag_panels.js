const { chromium } = require("/tmp/pwproj/node_modules/playwright-core");
(async () => {
  const browser = await chromium.launch({ executablePath: "/tmp/pw/bpath/chromium-1117/chrome-linux/chrome", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(process.argv[2], { waitUntil: "networkidle" });
  await page.waitForSelector(".depth-panel");
  await page.waitForTimeout(500);
  const info = await page.evaluate(() => {
    const root = document.getElementById("depths-root");
    const panels = Array.from(document.querySelectorAll(".depth-panel")).map((p) => ({
      depth: p.getAttribute("data-depth"), top: p.offsetTop, height: p.offsetHeight,
    }));
    return { rootTop: root.offsetTop, rootHeight: root.offsetHeight, innerHeight: window.innerHeight, panels, scrollHeight: document.documentElement.scrollHeight };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
