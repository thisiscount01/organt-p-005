import sys, time
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

    # ---------- REQ1: click-focus empty #intake-answer, type j/k/1-4, expect literal typing ----------
    intake = page.locator("#intake")
    intake.scroll_into_view_if_needed()
    ans = page.locator("#intake-answer")
    ans.click()
    page.wait_for_timeout(200)
    # ensure empty
    ans.fill("")
    active_tag_before = page.evaluate("document.activeElement && document.activeElement.tagName")
    for k in ["j","k","1","2","3","4"]:
        page.keyboard.press(k)
    page.wait_for_timeout(150)
    typed_value = ans.input_value()
    active_tag_during = page.evaluate("document.activeElement && document.activeElement.tagName")
    results["REQ1_click_focus"] = {
        "active_tag_before": active_tag_before,
        "active_tag_during": active_tag_during,
        "typed_value": typed_value,
        "pass": typed_value == "jk1234" and active_tag_during == "TEXTAREA",
    }

    # ---------- REQ1b: non-empty field, same keys, still literal typing (no nav) ----------
    ans.fill("existing-text-")
    for k in ["j","1"]:
        page.keyboard.press(k)
    page.wait_for_timeout(150)
    typed_value2 = ans.input_value()
    results["REQ1_nonempty"] = {
        "typed_value": typed_value2,
        "pass": typed_value2 == "existing-text-j1",
    }

    # ---------- REQ1c: Tab-focus path (not click) ----------
    ans.fill("")
    page.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
    page.evaluate("document.querySelector('#intake-answer').focus()")
    page.wait_for_timeout(100)
    active_tag_tab = page.evaluate("document.activeElement && document.activeElement.tagName")
    for k in ["j","k","2"]:
        page.keyboard.press(k)
    page.wait_for_timeout(150)
    typed_value3 = ans.input_value()
    results["REQ1_programmatic_focus"] = {
        "active_tag": active_tag_tab,
        "typed_value": typed_value3,
        "pass": typed_value3 == "jk2",
    }

    # ---------- REQ2: blur out of field (focus BODY), same keys => depth-jump nav ----------
    page.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
    page.wait_for_timeout(300)
    active_tag_navtest = page.evaluate("document.activeElement && document.activeElement.tagName")
    scrollY_before = page.evaluate("window.scrollY")
    page.keyboard.press("1")
    page.wait_for_timeout(400)
    scrollY_after_1 = page.evaluate("window.scrollY")
    page.keyboard.press("4")
    page.wait_for_timeout(400)
    scrollY_after_4 = page.evaluate("window.scrollY")
    page.keyboard.press("k")
    page.wait_for_timeout(400)
    scrollY_after_k = page.evaluate("window.scrollY")
    results["REQ2_nav"] = {
        "active_tag_before_nav": active_tag_navtest,
        "scrollY_before": scrollY_before,
        "scrollY_after_1": scrollY_after_1,
        "scrollY_after_4": scrollY_after_4,
        "scrollY_after_k": scrollY_after_k,
        "pass": (scrollY_after_1 != scrollY_before) and (scrollY_after_4 != scrollY_after_1) and (scrollY_after_k != scrollY_after_4),
    }

    page.screenshot(path="/tmp/qa_req1_field.png")
    # go back to nav state, take screenshot at a jumped depth
    page.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
    page.keyboard.press("2")
    page.wait_for_timeout(500)
    page.screenshot(path="/tmp/qa_req2_nav.png")

    results["console_errors"] = console_errors
    browser.close()

import json
print(json.dumps(results, indent=2, ensure_ascii=False))
