import sys
sys.path.insert(0, "/tmp/pylibs")
from playwright.sync_api import sync_playwright

CHROME = "/tmp/pw/bpath/chromium-1117/chrome-linux/chrome"
URL = "https://organt-p-005-huc4.onrender.com/"

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox", "--disable-dev-shm-usage"])
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    page.goto(URL, wait_until="networkidle")
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(2200)
    active = page.evaluate("document.activeElement && document.activeElement.id")
    print("active after scroll-to-bottom @1920x1080:", active)
    page.keyboard.press("2")
    page.wait_for_timeout(150)
    val = page.locator("#intake-answer").input_value()
    print("value after '2':", repr(val))
    print("PASS" if (active == "intake-answer" and val == "2") else "FAIL")
    page.close()
    browser.close()
