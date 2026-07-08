const { chromium } = require("/tmp/pwproj/node_modules/playwright");

const PORT = 4002; // server.js는 이 run 호출 안에서 이미 백그라운드로 기동돼 있어야 함
const EXE = "/tmp/pw/bpath/chromium-1117/chrome-linux/chrome";

function log(label, ok, extra) {
  console.log((ok ? "PASS" : "FAIL") + " — " + label + (extra ? " :: " + JSON.stringify(extra) : ""));
}

async function main() {
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  let allPass = true;
  try {
    // ── 시나리오 A: 체인(click → Escape → 700ms 대기(>420ms) → depth-jump 키 반복) ──
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(`http://127.0.0.1:${PORT}/`);
      await page.locator("#intake-answer").scrollIntoViewIfNeeded();
      await page.click("#intake-answer");
      const focusedAfterClick = await page.evaluate(() => document.activeElement && document.activeElement.id);
      log("A1 클릭 직후 intake-answer 포커스", focusedAfterClick === "intake-answer", { focusedAfterClick });
      allPass = allPass && focusedAfterClick === "intake-answer";

      await page.keyboard.press("Escape");
      const focusedAfterEscape = await page.evaluate(() => document.activeElement === document.body);
      log("A2 Escape 직후 body로 blur", focusedAfterEscape);
      allPass = allPass && focusedAfterEscape;

      await page.waitForTimeout(700); // > 420ms — 구버전 회귀라면 이 사이 재포커스됨

      const focusedAfterWait = await page.evaluate(() => document.activeElement === document.body);
      log("A3 700ms 대기 후에도 body 유지(재포커스 안 됨) — 이번 fix 핵심", focusedAfterWait);
      allPass = allPass && focusedAfterWait;

      // intake-answer는 페이지 최하단(memory 깊이)에 있어 클릭 시 이미 최심부로 스크롤돼
      // 있다 — "j"(정방향)는 구조적으로 더 갈 곳이 없으므로 depth 불변이 정상(회귀 아님,
      // regression_depth_jump.js GROUP B 주석과 동일 axis). 이 케이스의 진짜 판정축은
      // "포커스가 intake-answer로 되돌아가지 않는가"와 "값이 안 새는가"뿐이다.
      const depthBefore = await page.evaluate(() => document.body.getAttribute("data-depth"));
      await page.keyboard.press("j");
      await page.waitForTimeout(150);
      const depthAfterJ1 = await page.evaluate(() => document.body.getAttribute("data-depth"));
      const focusedAfterJ1 = await page.evaluate(() => document.activeElement && document.activeElement.id);
      const valAfterJ1 = await page.evaluate(() => document.getElementById("intake-answer").value);
      log("A4 1번째 'j' → 필드 미포커스 & 미타이핑(이미 최심부라 depth 불변은 정상)", focusedAfterJ1 !== "intake-answer" && valAfterJ1 === "",
        { depthBefore, depthAfterJ1, focusedAfterJ1, valAfterJ1 });
      allPass = allPass && focusedAfterJ1 !== "intake-answer" && valAfterJ1 === "";

      await page.keyboard.press("j");
      await page.waitForTimeout(150);
      const depthAfterJ2 = await page.evaluate(() => document.body.getAttribute("data-depth"));
      const valAfterJ2 = await page.evaluate(() => document.getElementById("intake-answer").value);
      log("A5 2번째 'j'도 depth-jump(타이핑 아님) — PM 회귀 재현점", depthAfterJ2 !== depthAfterJ1 || depthAfterJ2 === "memory",
        { depthAfterJ1, depthAfterJ2, valAfterJ2 });
      allPass = allPass && valAfterJ2 === ""; // 글자로 새지 않아야 함(회귀라면 "j"or"jj"가 찍힘)

      await page.keyboard.press("j");
      await page.waitForTimeout(150);
      const valAfterJ3 = await page.evaluate(() => document.getElementById("intake-answer").value);
      log("A6 3번째 'j'도 필드에 안 새어듦(누적 없음)", valAfterJ3 === "", { valAfterJ3 });
      allPass = allPass && valAfterJ3 === "";

      await page.close();
    }

    // ── 시나리오 B: 스크롤완주 autofocus 타이머가 아직 안 끝난 상태에서 depth-jump로 즉시 이탈 ──
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
      await page.goto(`http://127.0.0.1:${PORT}/`);
      // intake까지 스크롤(IntersectionObserver 발화 → focusIntake() 420ms 예약)
      await page.locator("#intake-answer").scrollIntoViewIfNeeded();
      await page.waitForTimeout(60); // IO 발화는 즉시지만 타이머는 아직 420ms 안 지남
      // 아직 포커스 전에 depth-jump로 맨 위(Home)로 즉시 이탈
      await page.keyboard.press("Home");
      await page.waitForTimeout(700); // 원래 420ms 타이머가 있었다면 이 사이 발동
      const focusedAfterTimerWindow = await page.evaluate(() => document.activeElement && document.activeElement.id);
      log("B1 예약된 autofocus가 Home 이동 뒤에도 안 훔쳐감", focusedAfterTimerWindow !== "intake-answer",
        { focusedAfterTimerWindow });
      allPass = allPass && focusedAfterTimerWindow !== "intake-answer";
      await page.close();
    }

    // ── 시나리오 D: 스크롤 완주 autofocus가 "실제로 포커스를 잡은" 뒤(타이머 완료) →
    //    Escape → 700ms 대기 → depth-jump 연속 3회. 시나리오B는 타이머가 아직 대기중일
    //    때 이탈하는 케이스만 봤고, 시나리오A는 클릭 기반이었다 — PM 수용기준 문구의
    //    "인테이크 클릭(또는 스크롤 완주 autofocus)" 중 후자+Escape 체인의 유일한 공백.
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
      await page.goto(`http://127.0.0.1:${PORT}/`);
      await page.locator("#intake-answer").scrollIntoViewIfNeeded();
      await page.waitForTimeout(700); // > 420ms — autofocus 타이머가 실제로 발동해 필드에 포커스
      const focusedAfterAutofocus = await page.evaluate(() => document.activeElement && document.activeElement.id);
      log("D1 스크롤완주 후 실제 autofocus로 intake-answer 포커스", focusedAfterAutofocus === "intake-answer", { focusedAfterAutofocus });
      allPass = allPass && focusedAfterAutofocus === "intake-answer";

      await page.keyboard.press("Escape");
      await page.waitForTimeout(700); // > 420ms — 재포커스 타이머가 있었다면 이 사이 발동
      const focusedAfterEscapeWait = await page.evaluate(() => document.activeElement === document.body);
      log("D2 Escape 후 700ms 지나도 body 유지(autofocus 경로도 동일 axis)", focusedAfterEscapeWait, { focusedAfterEscapeWait });
      allPass = allPass && focusedAfterEscapeWait;

      for (const key of ["k", "k", "1"]) {
        await page.keyboard.press(key);
        await page.waitForTimeout(150);
      }
      const valAfterChain = await page.evaluate(() => document.getElementById("intake-answer").value);
      const focusedAfterChain = await page.evaluate(() => document.activeElement && document.activeElement.id);
      log("D3 k,k,1 연속 depth-jump — 필드로 안 새고 재포커스도 안 됨", valAfterChain === "" && focusedAfterChain !== "intake-answer",
        { valAfterChain, focusedAfterChain });
      allPass = allPass && valAfterChain === "" && focusedAfterChain !== "intake-answer";
      await page.close();
    }

    // ── 시나리오 C: 회귀 이전 12케이스 중 대표 3경로 x 대표키 재확인(기존 axis 무회귀) ──
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(`http://127.0.0.1:${PORT}/`);
      await page.click("#intake-answer");
      await page.keyboard.type("jk14", { delay: 0 });
      const val = await page.evaluate(() => document.getElementById("intake-answer").value);
      log("C1 포커스 있음(click) → j k 1 4 전부 타이핑", val === "jk14", { val });
      allPass = allPass && val === "jk14";
      await page.close();
    }
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(`http://127.0.0.1:${PORT}/`);
      const before = await page.evaluate(() => document.activeElement === document.body);
      await page.keyboard.press("j");
      await page.waitForTimeout(600); // smooth-scroll 전환 settle 여유(120ms는 애니메이션 도중 스냅샷이라 오탐)
      const depth = await page.evaluate(() => document.body.getAttribute("data-depth"));
      log("C2 포커스 없음(신선한 페이지) → 'j' depth-jump", before && depth === "bytecode", { before, depth });
      allPass = allPass && before && depth === "bytecode";
      await page.close();
    }
  } finally {
    await browser.close();
  }

  console.log(allPass ? "\n=== ALL_PASS ===" : "\n=== HAS_FAIL ===");
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error("SCRIPT_ERROR", e); process.exit(2); });
