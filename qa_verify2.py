import json
from playwright.sync_api import sync_playwright

BASE = "https://organt-p-005-huc4.onrender.com"
results = {}
console_errors = []

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1366, "height": 768})
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
    page.on("pageerror", lambda exc: console_errors.append(str(exc)))

    page.goto(BASE, wait_until="networkidle", timeout=30000)

    # Natural IO-triggered autofocus path: scroll to bottom via direct window.scrollTo (mimics real
    # user scroll-to-completion) WITHOUT clicking/keyboard-nav, then wait for the IO callback + the
    # 420ms delayed focusIntake() timer, then confirm activeElement became #intake-answer.
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(1200)  # allow IO callback + 420ms setTimeout to fire
    active_tag_auto = page.evaluate("document.activeElement && document.activeElement.tagName")
    active_id_auto = page.evaluate("document.activeElement && document.activeElement.id")

    # value should be empty still (fresh page)
    val_before = page.evaluate("document.getElementById('intake-answer').value")

    for k in ["j","k","1","2","3","4"]:
        page.keyboard.press(k)
    page.wait_for_timeout(150)
    typed_value = page.evaluate("document.getElementById('intake-answer').value")

    results["REQ1_natural_autofocus"] = {
        "active_tag_after_scroll_wait": active_tag_auto,
        "active_id_after_scroll_wait": active_id_auto,
        "value_before_typing": val_before,
        "typed_value": typed_value,
        "pass": active_id_auto == "intake-answer" and typed_value == "jk1234",
    }

    # Rapid-fire race check: press keys with zero manual delay back-to-back right after blur,
    # to probe for any race between blur-driven state flags and keydown handling.
    page.evaluate("document.activeElement.blur()")
    page.evaluate("document.getElementById('intake-answer').value=''")
    ans = page.locator("#intake-answer")
    ans.click()
    page.evaluate("document.activeElement.blur()")  # immediately blur again (simulate fast blur race)
    scrollY_before_race = page.evaluate("window.scrollY")
    page.keyboard.press("j")  # should navigate now since field is blurred
    page.wait_for_timeout(400)
    scrollY_after_race = page.evaluate("window.scrollY")
    active_after_race = page.evaluate("document.activeElement && document.activeElement.tagName")
    results["race_click_then_immediate_blur"] = {
        "active_after_race": active_after_race,
        "scrollY_before": scrollY_before_race,
        "scrollY_after": scrollY_after_race,
        "note": "click then immediate programmatic blur before key; expect nav (field not focused)",
        "pass": scrollY_after_race != scrollY_before_race,
    }

    results["console_errors"] = console_errors
    browser.close()

print(json.dumps(results, indent=2, ensure_ascii=False))
