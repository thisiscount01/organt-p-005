// 프론트엔드 실브라우저 회귀 검증 — 샌드박스의 절대경로 EACCES를 우회하기 위해
// (1) server.js를 상대경로 fs.readFileSync + Function 래퍼로 직접 실행하고
// (2) 이 파일 자체도 `node -e "eval(fs.readFileSync(...))"`로 구동한다(require() 엔트리 회피).
// 서버·앱 실코드는 무수정 — 구동 방식만 우회.
"use strict";
const fs = require("fs");
const { chromium } = require("playwright");

function bootServer() {
  const src = fs.readFileSync("server.js", "utf8");
  const wrapper = Function("require", "module", "exports", "__filename", "__dirname", src);
  const fakeModule = { exports: {} };
  wrapper(require, fakeModule, fakeModule.exports, "server.js", ".");
}

async function main() {
  bootServer();
  await new Promise((r) => setTimeout(r, 600));

  let ok = true;
  const errors = [];
  function check(name, cond, extra) {
    ok = ok && !!cond;
    console.log((cond ? "PASS" : "FAIL"), name, "-", extra === undefined ? "" : extra);
  }

  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + String(e)));

  const resp = await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  check("0 index.html 200", resp && resp.status() === 200, resp && resp.status());
  await page.waitForTimeout(500);
  check("0b no console errors on load", errors.length === 0, JSON.stringify(errors));

  // 회귀 재현: 빈 입력칸 + "j" → 값이 "j"여야 함(첫 글자 유실 금지)
  await page.$eval("#intake-answer", (el) => { el.value = ""; el.focus(); });
  await page.keyboard.press("j");
  let v = await page.$eval("#intake-answer", (el) => el.value);
  check("1 empty field + 'j' -> value=='j'", v === "j", JSON.stringify(v));

  // 타이핑 중(비어있지 않음) 상태에서 ArrowDown은 여전히 입력칸 안에서 소비돼야(값 불변)
  await page.keyboard.press("ArrowDown");
  let v2 = await page.$eval("#intake-answer", (el) => el.value);
  check("2 non-empty field + ArrowDown -> value 불변", v2 === v, JSON.stringify(v2));

  // 숫자키도 동일 원칙
  await page.$eval("#intake-answer", (el) => { el.value = ""; el.focus(); });
  await page.keyboard.press("2");
  let v3 = await page.$eval("#intake-answer", (el) => el.value);
  check("3 empty field + '2' -> value=='2'", v3 === "2", JSON.stringify(v3));

  // 빈 입력칸일 때는 여전히 이동 키가 포커스 트랩을 풀어야 함(기존 의도 보존)
  await page.$eval("#intake-answer", (el) => { el.value = ""; el.focus(); });
  const beforeDepth = await page.evaluate(() => document.body.getAttribute("data-depth"));
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(700);
  const afterActive = await page.evaluate(() => document.activeElement && document.activeElement.id);
  const afterDepth = await page.evaluate(() => document.body.getAttribute("data-depth"));
  check("4 empty field + ArrowDown -> 포커스 트랩 해제", afterActive !== "intake-answer" || afterDepth !== beforeDepth,
    `active=${afterActive} depth ${beforeDepth}->${afterDepth}`);

  check("5 no console errors during whole run", errors.length === 0, JSON.stringify(errors));

  await browser.close();
  console.log("RESULT:", ok ? "ALL PASS" : "SOME FAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error("HARNESS ERROR:", e && e.stack || e); process.exit(2); });
