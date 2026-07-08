import json, sys
from playwright.sync_api import sync_playwright

URL = "https://organt-p-005-huc4.onrender.com/"
results = []

def rec(name, ok, detail=""):
    results.append({"name": name, "ok": ok, "detail": detail})
    print(("PASS" if ok else "FAIL"), "-", name, ("::" + detail) if detail else "")

def get_depth(page):
    return page.eval_on_selector("body", "el => el.getAttribute('data-depth')")

def get_active_info(page):
    return page.evaluate("""() => {
        const a = document.activeElement;
        return {tag: a ? a.tagName : null, id: a ? a.id : null};
    }""")

def get_answer_value(page):
    return page.eval_on_selector("#intake-answer", "el => el.value")

def scroll_to_intake(page):
    page.eval_on_selector("#intake", "el => el.scrollIntoView({behavior:'auto', block:'start'})")

with sync_playwright() as p:
    browser = p.chromium.launch()

    # ---------- Scenario A: chain (Escape blur -> 420ms wait -> j/k/1/4 = depth-jump) ----------
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.goto(URL, wait_until="networkidle")
    page.wait_for_timeout(300)

    page.click("#intake-answer")
    active = get_active_info(page)
    rec("A0. click(#intake-answer) focuses it", active.get("id") == "intake-answer", str(active))

    page.keyboard.press("Escape")
    page.wait_for_timeout(600)  # > 420ms
    active = get_active_info(page)
    rec("A1. Escape->blur, 600ms wait, activeElement is BODY (not re-focused by stale timer)",
        active.get("tag") == "BODY", str(active))

    depth_before = get_depth(page)
    page.keyboard.press("j")
    page.wait_for_timeout(700)
    depth_after_j = get_depth(page)
    rec("A2. after chain, 'j' triggers depth-jump (depth changed, not typed)",
        depth_after_j != depth_before, f"before={depth_before} after={depth_after_j}")

    val_after_j = get_answer_value(page)
    rec("A2b. 'j' did NOT type into #intake-answer", val_after_j == "", f"value={val_after_j!r}")

    depth_before2 = get_depth(page)
    page.keyboard.press("k")
    page.wait_for_timeout(700)
    depth_after_k = get_depth(page)
    rec("A3. 'k' triggers depth-jump", depth_after_k != depth_before2, f"before={depth_before2} after={depth_after_k}")

    page.keyboard.press("1")
    page.wait_for_timeout(700)
    depth_after_1 = get_depth(page)
    rec("A4. '1' triggers depth-jump to surface", depth_after_1 == "surface", f"after={depth_after_1}")

    page.keyboard.press("4")
    page.wait_for_timeout(700)
    depth_after_4 = get_depth(page)
    rec("A5. '4' triggers depth-jump to memory", depth_after_4 == "memory", f"after={depth_after_4}")

    val_final = get_answer_value(page)
    rec("A6. #intake-answer remained empty throughout chain scenario", val_final == "", f"value={val_final!r}")

    ctx.close()

    # ---------- Scenario B: scroll-to-completion autofocus at two viewports ----------
    for (w, h) in [(1280, 720), (1366, 768)]:
        ctx = browser.new_context(viewport={"width": w, "height": h})
        page = ctx.new_page()
        page.goto(URL, wait_until="networkidle")
        page.wait_for_timeout(300)

        scroll_to_intake(page)
        # allow IO threshold(0.45) callback + 420ms focus delay
        page.wait_for_timeout(1500)

        active = get_active_info(page)
        rec(f"B1[{w}x{h}]. scroll-to-#intake autofocus fires (#intake-answer focused)",
            active.get("id") == "intake-answer", str(active))

        # now test j/k/1/4 type as characters (not nav) while focused
        page.eval_on_selector("#intake-answer", "el => el.value=''")
        for k in ["j", "k", "1", "4"]:
            before = get_answer_value(page)
            page.keyboard.press(k)
            after = get_answer_value(page)
            rec(f"B2[{w}x{h}]. key '{k}' typed as character while autofocused",
                after == before + k, f"before={before!r} after={after!r}")

        ctx.close()

    # ---------- Scenario C: 12 cases ----------
    # C-focus: 3 focus paths x keys j/k/1/4 typed as char (12 sub but grouped: click, tab, scroll-autofocus)
    focus_paths = {}

    # path 1: click
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.goto(URL, wait_until="networkidle")
    page.wait_for_timeout(300)
    page.click("#intake-answer")
    page.eval_on_selector("#intake-answer", "el => el.value=''")
    ok_all = True
    detail_parts = []
    for k in ["j", "k", "1", "4"]:
        before = get_answer_value(page)
        page.keyboard.press(k)
        after = get_answer_value(page)
        good = after == before + k
        ok_all = ok_all and good
        detail_parts.append(f"{k}:{good}")
    rec("C-click. focus via click -> j/k/1/4 all typed as chars", ok_all, ",".join(detail_parts))
    ctx.close()

    # path 2: Tab navigation to reach the field
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.goto(URL, wait_until="networkidle")
    page.wait_for_timeout(300)
    scroll_to_intake(page)
    page.wait_for_timeout(1500)  # let autofocus fire/settle first
    page.keyboard.press("Escape")
    page.wait_for_timeout(600)
    # now tab forward until intake-answer is focused (bounded attempts)
    reached = False
    for _ in range(30):
        page.keyboard.press("Tab")
        active = get_active_info(page)
        if active.get("id") == "intake-answer":
            reached = True
            break
    rec("C-tab-reach. Tab navigation can reach #intake-answer", reached, str(get_active_info(page)))
    if reached:
        page.eval_on_selector("#intake-answer", "el => el.value=''")
        ok_all = True
        detail_parts = []
        for k in ["j", "k", "1", "4"]:
            before = get_answer_value(page)
            page.keyboard.press(k)
            after = get_answer_value(page)
            good = after == before + k
            ok_all = ok_all and good
            detail_parts.append(f"{k}:{good}")
        rec("C-tab. focus via Tab -> j/k/1/4 all typed as chars", ok_all, ",".join(detail_parts))
    ctx.close()

    # path 3: scroll-autofocus (reuse pattern like B, at 1440x900)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.goto(URL, wait_until="networkidle")
    page.wait_for_timeout(300)
    scroll_to_intake(page)
    page.wait_for_timeout(1500)
    active = get_active_info(page)
    autofocus_ok = active.get("id") == "intake-answer"
    rec("C-autofocus-reach. scroll autofocus reaches #intake-answer (1440x900)", autofocus_ok, str(active))
    if autofocus_ok:
        page.eval_on_selector("#intake-answer", "el => el.value=''")
        ok_all = True
        detail_parts = []
        for k in ["j", "k", "1", "4"]:
            before = get_answer_value(page)
            page.keyboard.press(k)
            after = get_answer_value(page)
            good = after == before + k
            ok_all = ok_all and good
            detail_parts.append(f"{k}:{good}")
        rec("C-autofocus. focus via scroll-autofocus -> j/k/1/4 all typed as chars", ok_all, ",".join(detail_parts))
    ctx.close()

    # C-nofocus: no focus in field -> depth badge delta for j/k/1/4
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.goto(URL, wait_until="networkidle")
    page.wait_for_timeout(300)
    page.click("body")
    page.evaluate("() => document.activeElement && document.activeElement.blur && document.activeElement.blur()")
    for k, label in [("j", "j->next"), ("k", "k->prev"), ("1", "1->surface"), ("4", "4->memory")]:
        before = get_depth(page)
        page.keyboard.press(k)
        page.wait_for_timeout(700)
        after = get_depth(page)
        rec(f"C-nofocus[{label}]. no field focus -> depth badge changes",
            after != before or (k in "14" and after == ("surface" if k=="1" else "memory")),
            f"before={before} after={after}")
    ctx.close()

    browser.close()

print("\n=== SUMMARY ===")
total = len(results)
passed = sum(1 for r in results if r["ok"])
print(f"{passed}/{total} PASS")
for r in results:
    if not r["ok"]:
        print("FAILED:", r["name"], r["detail"])

with open("/tmp/qa_results.json", "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

sys.exit(0 if passed == total else 1)
