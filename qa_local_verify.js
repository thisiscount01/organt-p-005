const { chromium } = require("playwright");

const TARGET_URL = process.env.QA_URL || "http://localhost:3000/";
const results = [];
function rec(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? "PASS" : "FAIL"), "-", name, detail ? ":: " + detail : "");
}

async function getActive(page) {
  return page.evaluate(() => {
    const a = document.activeElement;
    return { tag: a ? a.tagName : null, id: a ? a.id : null };
  });
}
async function getDepth(page) {
  return page.evaluate(() => document.body.getAttribute("data-depth"));
}
async function getVal(page) {
  return page.$eval("#intake-answer", (el) => el.value);
}

(async () => {
  const browser = await chromium.launch();

  // ---------- Scenario A: PM repro — click #intake-answer -> immediate Escape -> wait ~1s -> j/k/1/4 must depth-jump, not type ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(TARGET_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);

    await page.click("#intake-answer"); // browser auto-scrolls #intake into view -> first-ever IO threshold cross, async
    let active = await getActive(page);
    rec("A0. click(#intake-answer) focuses it", active.id === "intake-answer", JSON.stringify(active));

    await page.keyboard.press("Escape");
    await page.waitForTimeout(52);
    active = await getActive(page);
    rec("A1. Escape->blur immediate (~52ms), activeElement is BODY", active.tag === "BODY", JSON.stringify(active));

    // wait through the historically-buggy window (~467-469ms after Escape) and beyond
    await page.waitForTimeout(900);
    active = await getActive(page);
    rec("A1b. 900ms after Escape, activeElement STILL BODY (no delayed re-focus by late IO fire)",
        active.tag === "BODY", JSON.stringify(active));

    // click(#intake-answer) auto-scrolled us to the LAST stop (#intake). #coda/#intake sit
    // AFTER depths-root, so scroll-progress (and therefore the depth badge) saturates at
    // "memory" across both — moving between them via 'k' alone is a real nav but produces
    // no badge delta (not a bug, just a dead zone for THIS assertion). Use the absolute jump
    // '1' first to leave that zone unambiguously, then verify relative j/k inside it.
    await page.keyboard.press("1");
    await page.waitForTimeout(1800);
    const depthAfter1 = await getDepth(page);
    rec("A2. after chain, '1' triggers depth-jump to surface (depth changed, not typed)",
        depthAfter1 === "surface", `after=${depthAfter1}`);

    await page.keyboard.press("j");
    await page.waitForTimeout(1800);
    const depthAfterJ = await getDepth(page);
    rec("A2c. 'j' -> bytecode (relative nav works)", depthAfterJ === "bytecode", `after=${depthAfterJ}`);

    const valAfterJ = await getVal(page);
    rec("A2b. 'j' did NOT leak into #intake-answer", valAfterJ === "", `value=${JSON.stringify(valAfterJ)}`);

    await page.keyboard.press("k");
    await page.waitForTimeout(1800);
    const depthAfterK = await getDepth(page);
    rec("A3. 'k' -> surface", depthAfterK === "surface", `after=${depthAfterK}`);
    await page.keyboard.press("4");
    await page.waitForTimeout(1800);
    const depthAfter4 = await getDepth(page);
    rec("A4. '4' -> memory", depthAfter4 === "memory", `after=${depthAfter4}`);

    const valFinal = await getVal(page);
    rec("A5. #intake-answer remained empty throughout chain scenario", valFinal === "", `value=${JSON.stringify(valFinal)}`);
    await ctx.close();
  }

  // ---------- Scenario A-repeat x5 for flake confidence ----------
  for (let i = 0; i < 5; i++) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(TARGET_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    await page.click("#intake-answer");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(900);
    const active = await getActive(page);
    rec(`A-repeat[${i}]. activeElement BODY after Escape+900ms`, active.tag === "BODY", JSON.stringify(active));
    await ctx.close();
  }

  // ---------- Scenario B: scroll-to-completion autofocus still works (regression guard) ----------
  for (const [w, h] of [[1280, 720], [1366, 768]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto(TARGET_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    await page.$eval("#intake", (el) => el.scrollIntoView({ behavior: "auto", block: "start" }));
    await page.waitForTimeout(1500);
    const active = await getActive(page);
    rec(`B1[${w}x${h}]. scroll-to-#intake autofocus fires`, active.id === "intake-answer", JSON.stringify(active));
    await page.$eval("#intake-answer", (el) => (el.value = ""));
    let ok = true, parts = [];
    for (const k of ["j", "k", "1", "4"]) {
      const before = await getVal(page);
      await page.keyboard.press(k);
      const after = await getVal(page);
      const good = after === before + k;
      ok = ok && good;
      parts.push(`${k}:${good}`);
    }
    rec(`B2[${w}x${h}]. j/k/1/4 typed as chars while autofocused`, ok, parts.join(","));
    await ctx.close();
  }

  // ---------- Scenario C: no-focus depth-jump still works (regression guard) ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(TARGET_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
    for (const [k, label] of [["j", "j->next"], ["k", "k->prev"], ["1", "1->surface"], ["4", "4->memory"]]) {
      const before = await getDepth(page);
      await page.keyboard.press(k);
      await page.waitForTimeout(700);
      const after = await getDepth(page);
      // boundary-tolerant: '1'/'4' are ABSOLUTE jumps — if already at that target, "no change"
      // is still correct (not a no-op bug), so accept after===before when it already equals target.
      const target = k === "1" ? "surface" : k === "4" ? "memory" : null;
      const ok = after !== before || (target !== null && after === target);
      rec(`C-nofocus[${label}]. no field focus -> depth badge changes (or already-at-target)`, ok, `before=${before} after=${after}`);
    }
    await ctx.close();
  }

  // ---------- Scenario D: coda CTA click races the section's own IO (real-world path from QA report) ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(TARGET_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    await page.click("#coda-cta"); // scrollIntoView + focusIntake() direct call, races #intake's own IO
    await page.waitForTimeout(700);
    let active = await getActive(page);
    rec("D0. coda CTA click focuses intake-answer", active.id === "intake-answer", JSON.stringify(active));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(900);
    active = await getActive(page);
    rec("D1. Escape after CTA-focus -> stays BODY (no delayed re-focus)", active.tag === "BODY", JSON.stringify(active));
    // CTA click also scrolls to #intake — that + #coda sit after depths-root, a badge
    // "dead zone" for relative j/k (see A2 comment above). Use absolute '1' for an
    // unambiguous "real navigation happened" assertion.
    await page.keyboard.press("1");
    await page.waitForTimeout(1800);
    const depthAfter = await getDepth(page);
    rec("D2. '1' after CTA+Escape triggers depth-jump to surface", depthAfter === "surface", `after=${depthAfter}`);
    await ctx.close();
  }

  await browser.close();

  console.log("\n=== SUMMARY ===");
  const total = results.length, passed = results.filter((r) => r.ok).length;
  console.log(`${passed}/${total} PASS`);
  for (const r of results) if (!r.ok) console.log("FAILED:", r.name, r.detail);
  process.exit(passed === total ? 0 : 1);
})();
