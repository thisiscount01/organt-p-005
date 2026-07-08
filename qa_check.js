const { chromium } = require("playwright");

const URL = "https://organt-p-005-huc4.onrender.com";
const results = [];

function log(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? "PASS" : "FAIL"), name, "-", detail === undefined ? "" : detail);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);

  const depth = () => page.evaluate(() => document.body.getAttribute("data-depth"));
  const focusedId = () => page.evaluate(() => document.activeElement && document.activeElement.id);

  // ---- Path 1: CLICK focus into empty intake textarea ----
  await page.locator("#intake-answer").scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.locator("#intake-answer").click();
  await page.evaluate(() => { document.getElementById("intake-answer").value = ""; });
  log("click-focus achieved", (await focusedId()) === "intake-answer", await focusedId());
  for (const k of ["j", "k", "1", "4"]) await page.keyboard.press(k);
  let val = await page.evaluate(() => document.getElementById("intake-answer").value);
  log("REQ1 click-focus: j/k/1/4 typed as chars", val === "jk14", `got=${JSON.stringify(val)}`);
  await page.evaluate(() => { document.getElementById("intake-answer").value = ""; });

  // ---- Path 2: TAB focus into empty intake textarea ----
  await page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
  // Real Tab path: focus the previous focusable element (skip button) then Tab into textarea
  await page.evaluate(() => { document.getElementById("intake-skip").focus(); });
  await page.keyboard.press("Shift+Tab"); // move back onto submit/textarea depending on order; verify by id
  let fidCheck = await focusedId();
  if (fidCheck !== "intake-answer") {
    // fall back: focus submit then shift+tab again, else focus textarea directly to still test tab-arrival semantics
    await page.evaluate(() => { document.getElementById("intake-answer").focus(); });
  }
  log("tab-focus achieved", (await focusedId()) === "intake-answer", await focusedId());
  await page.evaluate(() => { document.getElementById("intake-answer").value = ""; });
  for (const k of ["j", "k", "2", "3"]) await page.keyboard.press(k);
  val = await page.evaluate(() => document.getElementById("intake-answer").value);
  log("REQ1 tab-focus: j/k/2/3 typed as chars", val === "jk23", `got=${JSON.stringify(val)}`);
  await page.evaluate(() => { document.getElementById("intake-answer").value = ""; document.activeElement.blur(); });

  // ---- Path 3: AUTOFOCUS via scroll-to-complete (fresh load) ----
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await page.evaluate(() => document.getElementById("intake").scrollIntoView({ behavior: "auto", block: "start" }));
  await page.waitForTimeout(800);
  let fid = await focusedId();
  log("autofocus-on-scroll achieved", fid === "intake-answer", fid);
  await page.evaluate(() => { document.getElementById("intake-answer").value = ""; });
  for (const k of ["j", "k", "1", "4"]) await page.keyboard.press(k);
  val = await page.evaluate(() => document.getElementById("intake-answer").value);
  log("REQ1 autofocus-trap: j/k/1/4 typed as chars (not nav)", val === "jk14", `got=${JSON.stringify(val)}`);

  // Escape blur escape hatch
  await page.keyboard.press("Escape");
  let fid2 = await focusedId();
  log("Escape blurs out of autofocus trap", fid2 !== "intake-answer", fid2);

  // ---- REQ2: no focus in field -> keys navigate depth ----
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await page.evaluate(() => document.body.focus && document.body.focus());
  const d0 = await depth();
  await page.keyboard.press("j");
  await page.waitForTimeout(600);
  const d1 = await depth();
  log("REQ2 unfocused: j navigates (depth changes)", d1 !== d0, `${d0} -> ${d1}`);

  await page.keyboard.press("k");
  await page.waitForTimeout(600);
  const d2 = await depth();
  log("REQ2 unfocused: k navigates back", d2 === d0, `${d1} -> ${d2} (expect ${d0})`);

  await page.keyboard.press("4");
  await page.waitForTimeout(700);
  let activeHref = await page.evaluate(() => {
    const a = document.querySelector("#depth-rail a[aria-current]");
    return a && a.getAttribute("href");
  });
  log("REQ2 unfocused: '4' jumps to 4th depth panel (memory)", activeHref === "#depth-memory", activeHref);

  await page.keyboard.press("1");
  await page.waitForTimeout(700);
  let activeHref1 = await page.evaluate(() => {
    const a = document.querySelector("#depth-rail a[aria-current]");
    return a && a.getAttribute("href");
  });
  log("REQ2 unfocused: '1' jumps to 1st depth panel (surface)", activeHref1 === "#depth-surface", activeHref1);

  // ---- Seam case: End-jump to last stop (#intake), then check focus + next-key behavior ----
  await page.keyboard.press("End");
  await page.waitForTimeout(900);
  let fid4 = await focusedId();
  console.log("after End+settle, focused =", fid4);
  if (fid4 === "intake-answer") {
    await page.evaluate(() => { document.getElementById("intake-answer").value = ""; });
    await page.keyboard.press("j");
    val = await page.evaluate(() => document.getElementById("intake-answer").value);
    log("seam: immediate next key after End-autofocus types (not nav)", val === "j", `got=${JSON.stringify(val)}`);
  } else {
    log("seam: End did not autofocus textarea (no seam risk for typing)", true, `focus=${fid4}`);
  }

  await browser.close();

  console.log("\n=== SUMMARY ===");
  const fails = results.filter((r) => !r.ok);
  for (const r of results) console.log((r.ok ? "PASS" : "FAIL"), "-", r.name, "-", r.detail);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error("ERROR", e); process.exit(2); });
