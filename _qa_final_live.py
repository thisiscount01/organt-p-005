import sys, time, json
sys.path.insert(0, "/tmp/pylibs")
from playwright.sync_api import sync_playwright

URL = "https://organt-p-005-huc4.onrender.com"
results = []

def rec(name, ok, detail):
    results.append({"name": name, "ok": ok, "detail": detail})
    print(f"[{'PASS' if ok else 'FAIL'}] {name}: {detail}")

IO_LOGGER = """
window.__ioRatios = [];
window.__ioLoggerReady = new Promise((resolve) => {
  const attach = () => {
    const el = document.getElementById('intake');
    if (!el) { requestAnimationFrame(attach); return; }
    new IntersectionObserver((entries) => {
      entries.forEach((e) => window.__ioRatios.push(e.intersectionRatio));
    }, { threshold: [0, 0.1, 0.2, 0.3, 0.35, 0.4, 0.42, 0.44, 0.45, 0.46, 0.5, 0.55, 0.6] }).observe(el);
    resolve(true);
  };
  attach();
});
"""

def new_page(pw, viewport=None):
    browser = pw.chromium.launch(headless=True)
    ctx = browser.new_context(viewport=viewport or {"width": 1366, "height": 900})
    page = ctx.new_page()
    page.add_init_script(IO_LOGGER)
    errs = []
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    page.goto(URL, wait_until="networkidle")
    page.evaluate("window.__ioLoggerReady")
    return browser, ctx, page, errs

with sync_playwright() as pw:
    # ---------- REQ1-A: click focus, empty field ----------
    browser, ctx, page, errs = new_page(pw)
    page.click("#intake-answer")
    active = page.evaluate("document.activeElement.id")
    for k in ["j","k","1","2","3","4"]:
        page.keyboard.press(k)
    val = page.evaluate("document.getElementById('intake-answer').value")
    rec("REQ1-click-empty", active == "intake-answer" and val == "jk1234", f"active={active} val={val!r} console_err={len(errs)}")
    browser.close()

    # ---------- REQ1-B: click focus, existing content ----------
    browser, ctx, page, errs = new_page(pw)
    page.click("#intake-answer")
    page.keyboard.type("existing-")
    for k in ["j","k","1","4"]:
        page.keyboard.press(k)
    val = page.evaluate("document.getElementById('intake-answer').value")
    rec("REQ1-click-existing", val == "existing-jk14", f"val={val!r}")
    browser.close()

    # ---------- REQ1-C: Tab focus ----------
    browser, ctx, page, errs = new_page(pw)
    page.click("body")
    found = False
    for _ in range(60):
        page.keyboard.press("Tab")
        aid = page.evaluate("document.activeElement && document.activeElement.id")
        if aid == "intake-answer":
            found = True
            break
    for k in ["j","k","1","4"]:
        page.keyboard.press(k)
    val = page.evaluate("document.getElementById('intake-answer').value")
    rec("REQ1-tab", found and val == "jk14", f"tab_found={found} val={val!r}")
    browser.close()

    # ---------- REQ2: no focus -> depth-jump nav ----------
    browser, ctx, page, errs = new_page(pw)
    d0 = page.evaluate("document.body.getAttribute('data-depth')")
    seq = []
    for k in ["1","j","k","4"]:
        page.keyboard.press(k)
        time.sleep(1.1)  # let smooth-scroll settle before reading depth
        d = page.evaluate("document.body.getAttribute('data-depth')")
        active = page.evaluate("document.activeElement.tagName")
        seq.append((k, d, active))
    expected_tags = ["1->surface", "j->bytecode", "k->surface", "4->memory"]
    ok = (seq[0][1] == "surface" and seq[1][1] == "bytecode" and seq[2][1] == "surface" and seq[3][1] == "memory"
          and all(a[2] != "TEXTAREA" for a in seq))
    rec("REQ2-nav", ok, f"initial={d0} seq={seq}")
    browser.close()

    # ---------- PM chain bug: click -> Escape -> 900ms+ wait -> j/k/1/4 ----------
    # 클릭 자체가 #intake-answer를 뷰포트로 auto-scroll하므로(실사용자가 이미 인테이크까지
    # 내려와 클릭한 상황과 동일), 이후 depth는 위치에 따라 절대키(1/4)만 결정적이다.
    # 상대키(j/k)는 "스크롤이 실제로 움직였는가"로, 절대키(1/4)는 "정확한 목적지 도달"로 검증.
    browser, ctx, page, errs = new_page(pw)
    page.click("#intake-answer")
    a1 = page.evaluate("document.activeElement.id")
    y_after_click = page.evaluate("window.scrollY")
    page.keyboard.press("Escape")
    a2 = page.evaluate("document.activeElement && document.activeElement.tagName")
    time.sleep(0.95)
    a3 = page.evaluate("document.activeElement && document.activeElement.tagName")

    steps = []
    val_before = page.evaluate("document.getElementById('intake-answer').value")
    # '1' -> 절대 이동: surface(depth-0)로 정확히 가야 함
    page.keyboard.press("1")
    time.sleep(1.1)
    d_1 = page.evaluate("document.body.getAttribute('data-depth')")
    y_1 = page.evaluate("window.scrollY")
    active_1 = page.evaluate("document.activeElement && document.activeElement.tagName")
    steps.append(("1", d_1, y_1, active_1))

    # 'j' -> 상대 이동(surface에서 +1 = bytecode로 결정적)
    page.keyboard.press("j")
    time.sleep(1.1)
    d_j = page.evaluate("document.body.getAttribute('data-depth')")
    y_j = page.evaluate("window.scrollY")
    active_j = page.evaluate("document.activeElement && document.activeElement.tagName")
    steps.append(("j", d_j, y_j, active_j))

    # 'k' -> 상대 이동(bytecode에서 -1 = surface로 결정적)
    page.keyboard.press("k")
    time.sleep(1.1)
    d_k = page.evaluate("document.body.getAttribute('data-depth')")
    y_k = page.evaluate("window.scrollY")
    active_k = page.evaluate("document.activeElement && document.activeElement.tagName")
    steps.append(("k", d_k, y_k, active_k))

    # '4' -> 절대 이동: memory(depth-3)로 정확히 가야 함
    page.keyboard.press("4")
    time.sleep(1.1)
    d_4 = page.evaluate("document.body.getAttribute('data-depth')")
    y_4 = page.evaluate("window.scrollY")
    active_4 = page.evaluate("document.activeElement && document.activeElement.tagName")
    steps.append(("4", d_4, y_4, active_4))

    val_after = page.evaluate("document.getElementById('intake-answer').value")
    active_list = [s[3] for s in steps]
    refocused = any(t == "TEXTAREA" for t in active_list)
    no_typing = (val_before == "" and val_after == "")
    nav_correct = (d_1 == "surface" and d_j == "bytecode" and d_k == "surface" and d_4 == "memory")
    ok = (a1 == "intake-answer" and a2 != "TEXTAREA" and a3 != "TEXTAREA"
          and not refocused and no_typing and nav_correct)
    rec("PM-chain-900ms", ok,
        f"a1={a1} a2_after_esc={a2} a3_after_950ms={a3} steps={steps} val_before={val_before!r} val_after={val_after!r}")
    browser.close()

    # ---------- PM chain bug variant: longer wait (1500ms) + rapid triple-j ----------
    browser, ctx, page, errs = new_page(pw)
    page.click("#intake-answer")
    page.keyboard.press("Escape")
    time.sleep(1.6)
    a_before = page.evaluate("document.activeElement && document.activeElement.tagName")
    vals = []
    for i in range(3):
        page.keyboard.press("j")
        time.sleep(0.05)
        vals.append(page.evaluate("document.getElementById('intake-answer').value"))
    final_active = page.evaluate("document.activeElement && document.activeElement.tagName")
    ok = a_before != "TEXTAREA" and all(v == "" for v in vals) and final_active != "TEXTAREA"
    rec("PM-chain-1500ms-triplej", ok, f"a_before={a_before} vals={vals} final_active={final_active}")
    browser.close()

    # ---------- Scroll-complete autofocus: 1280x720, real wheel scroll ----------
    for vw in [(1280,720), (1366,768)]:
        browser, ctx, page, errs = new_page(pw, viewport={"width": vw[0], "height": vw[1]})
        page.mouse.move(vw[0]//2, vw[1]//2)
        focused_at_step = None
        max_ratio_seen = 0
        for step in range(140):
            page.mouse.wheel(0, 80)
            time.sleep(0.05)
            aid = page.evaluate("document.activeElement && document.activeElement.id")
            if aid == "intake-answer":
                focused_at_step = step
                break
            atBottom = page.evaluate("(window.innerHeight + window.scrollY) >= (document.body.scrollHeight - 2)")
            if atBottom and step > 5:
                # a few extra polls in case IO callback is async
                for _ in range(10):
                    time.sleep(0.1)
                    aid2 = page.evaluate("document.activeElement && document.activeElement.id")
                    if aid2 == "intake-answer":
                        focused_at_step = step
                        break
                break
        # after autofocus, verify typing still works there (REQ1 path 3)
        typed_ok = None
        if focused_at_step is not None:
            for k in ["j","k","1","4"]:
                page.keyboard.press(k)
            v = page.evaluate("document.getElementById('intake-answer').value")
            typed_ok = (v == "jk14")
        io_ratios = page.evaluate("window.__ioRatios")
        max_ratio = max(io_ratios) if io_ratios else None
        threshold_confirmed = max_ratio is not None and max_ratio >= 0.44
        rec(f"scroll-autofocus-{vw[0]}x{vw[1]}", focused_at_step is not None and typed_ok and threshold_confirmed,
            f"focused_at_step={focused_at_step} typed_ok={typed_ok} console_err={len(errs)} max_io_ratio_observed={max_ratio} all_ratios={io_ratios}")
        browser.close()

    # ---------- 교차확인: scrollTo(programmatic, 2번째 독립 하네스) + 발화시점 가시비율 실측 ----------
    for vw in [(1280,720), (1366,768)]:
        browser, ctx, page, errs = new_page(pw, viewport={"width": vw[0], "height": vw[1]})
        # 바닥까지 프로그램적으로 완주(휠과 다른 경로 — 값 대입이 아니라 native scrollTo)
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        focused = None
        for _ in range(30):
            time.sleep(0.1)
            aid = page.evaluate("document.activeElement && document.activeElement.id")
            if aid == "intake-answer":
                focused = True
                break
        io_ratios = page.evaluate("window.__ioRatios")
        max_ratio = max(io_ratios) if io_ratios else None
        rec(f"scroll-autofocus-crosscheck-scrollTo-{vw[0]}x{vw[1]}", focused is True and max_ratio is not None and max_ratio >= 0.44,
            f"focused={focused} max_io_ratio_observed={max_ratio} all_ratios={io_ratios}")
        browser.close()

    # ---------- grep-equivalent: confirm no regressed axis reintroduced ----------
    browser, ctx, page, errs = new_page(pw)
    src = page.evaluate("fetch('/app.js').then(r=>r.text())")
    has_gesture = "gestureFocused" in src
    has_isempty = "isEmptyTextField" in src
    single_axis = "if (inField) return;" in src
    rec("grep-live-appjs", (not has_gesture) and (not has_isempty) and single_axis, f"gestureFocused={has_gesture} isEmptyTextField={has_isempty} single_axis_present={single_axis}")
    browser.close()

print("\n=== SUMMARY ===")
n_pass = sum(1 for r in results if r["ok"])
print(f"{n_pass}/{len(results)} PASS")
for r in results:
    if not r["ok"]:
        print(f"FAIL DETAIL: {r}")
print(json.dumps(results, ensure_ascii=False, indent=2))
