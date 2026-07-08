import sys
sys.path.insert(0, "/tmp/pylibs")
from playwright.sync_api import sync_playwright

CHROME = "/" + "tmp/pw/bpath/chromium-1117/chrome-linux/chrome"
URL = "https://organt-p-005-huc4.onrender.com/"

results = []

def log(n, desc, ok, detail):
    results.append((n, desc, ok, detail))
    print(f"[{n}] {'PASS' if ok else 'FAIL'} {desc} :: {detail}")

def get_depth_state(page):
    return page.evaluate("""() => {
        const active = document.querySelector('#depth-rail a[aria-current=\\"true\\"]');
        return {
            bodyDepth: document.body.getAttribute('data-depth'),
            railHref: active ? active.getAttribute('href') : null,
            announcer: document.getElementById('depth-announcer') ? document.getElementById('depth-announcer').textContent : null,
        };
    }""")

def settle(page, tries=25):
    last = None
    for _ in range(tries):
        page.wait_for_timeout(80)
        d = get_depth_state(page)
        if d == last:
            return d
        last = d
    return last

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox", "--disable-dev-shm-usage"])

    # ---------- GROUP A: focus in intake textarea, 3 arrival paths, expect TYPING ----------
    # 1. click -> j
    page = browser.new_page()
    page.goto(URL, wait_until="networkidle")
    ta = page.locator("#intake-answer")
    ta.scroll_into_view_if_needed()
    ta.click()
    active_before = page.evaluate("document.activeElement && document.activeElement.id")
    ta.press("j")
    page.wait_for_timeout(150)
    val = ta.input_value()
    log("A1", "click-focus empty -> 'j' types", val == "j", f"active_before={active_before} value={val!r}")
    page.close()

    # 2. click -> k
    page = browser.new_page()
    page.goto(URL, wait_until="networkidle")
    ta = page.locator("#intake-answer")
    ta.scroll_into_view_if_needed()
    ta.click()
    ta.press("k")
    page.wait_for_timeout(150)
    val = ta.input_value()
    log("A2", "click-focus empty -> 'k' types", val == "k", f"value={val!r}")
    page.close()

    # 3. Tab into field -> 1
    page = browser.new_page()
    page.goto(URL, wait_until="networkidle")
    page.locator("#intake-answer").scroll_into_view_if_needed()
    page.wait_for_timeout(200)
    # Tab repeatedly until #intake-answer is focused (bounded)
    focused_id = None
    for _ in range(40):
        page.keyboard.press("Tab")
        focused_id = page.evaluate("document.activeElement && document.activeElement.id")
        if focused_id == "intake-answer":
            break
    page.keyboard.press("1")
    page.wait_for_timeout(150)
    val = page.locator("#intake-answer").input_value()
    log("A3", "Tab-focus empty -> '1' types", focused_id == "intake-answer" and val == "1",
        f"focused_id={focused_id} value={val!r}")
    page.close()

    # 4. scroll-to-completion autofocus -> 2
    page = browser.new_page()
    page.goto(URL, wait_until="networkidle")
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    # wait for IO threshold(0.55) trigger + focusIntake's internal 420ms timer
    page.wait_for_timeout(1200)
    focused_id = page.evaluate("document.activeElement && document.activeElement.id")
    if focused_id != "intake-answer":
        page.wait_for_timeout(1500)
        focused_id = page.evaluate("document.activeElement && document.activeElement.id")
    page.keyboard.press("2")
    page.wait_for_timeout(150)
    val = page.locator("#intake-answer").input_value()
    log("A4", "scroll-autofocus empty -> '2' types", focused_id == "intake-answer" and val == "2",
        f"focused_id={focused_id} value={val!r}")
    page.close()

    # ---------- GROUP B: no focus in field, expect depth-jump navigation ----------
    # 5. j -> next
    page = browser.new_page()
    page.goto(URL, wait_until="networkidle")
    page.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
    before = settle(page)
    page.keyboard.press("j")
    after = settle(page)
    log("B5", "unfocused 'j' -> depth badge advances", before != after, f"before={before} after={after}")
    page.close()

    # 6. k -> previous (start from End so there's room to go back)
    page = browser.new_page()
    page.goto(URL, wait_until="networkidle")
    page.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
    page.keyboard.press("End")
    mid = settle(page)
    page.keyboard.press("k")
    after = settle(page)
    log("B6", "unfocused 'k' -> depth badge goes back", mid != after, f"mid={mid} after={after}")
    page.close()

    # 7. '1' -> depth 1 (surface)
    page = browser.new_page()
    page.goto(URL, wait_until="networkidle")
    page.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
    page.keyboard.press("End")
    settle(page)
    page.keyboard.press("1")
    after = settle(page)
    log("B7", "unfocused '1' -> depth badge = depth 1 (surface)",
        after["railHref"] == "#depth-surface" and after["bodyDepth"] == "surface", f"after={after}")
    page.close()

    # 8. '4' -> depth 4 (memory, last)
    page = browser.new_page()
    page.goto(URL, wait_until="networkidle")
    page.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
    before = settle(page)
    page.keyboard.press("4")
    after = settle(page)
    log("B8", "unfocused '4' -> depth badge = depth 4 (memory, last)",
        after["railHref"] == "#depth-memory" and after["bodyDepth"] == "memory", f"before={before} after={after}")
    page.close()

    browser.close()

print("\n=== SUMMARY ===")
n_fail = sum(1 for r in results if not r[2])
for n, desc, ok, detail in results:
    print(f"{n}: {'PASS' if ok else 'FAIL'} - {desc}")
print(f"\n{len(results)-n_fail}/{len(results)} PASS")
sys.exit(1 if n_fail else 0)
