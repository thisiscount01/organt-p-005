import sys
sys.path.insert(0, "/tmp/pylibs")
from playwright.sync_api import sync_playwright

CHROME = "/" + "tmp/pw/bpath/chromium-1117/chrome-linux/chrome"
URL = "https://organt-p-005-huc4.onrender.com/"

results = []

def log(n, desc, ok, detail):
    results.append((n, desc, ok, detail))
    print(f"[{n}] {'PASS' if ok else 'FAIL'} {desc} :: {detail}")

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox", "--disable-dev-shm-usage"])

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

    browser.close()

print("\n=== SUMMARY A ===")
n_fail = sum(1 for r in results if not r[2])
for n, desc, ok, detail in results:
    print(f"{n}: {'PASS' if ok else 'FAIL'} - {desc}")
print(f"{len(results)-n_fail}/{len(results)} PASS")
sys.exit(1 if n_fail else 0)
