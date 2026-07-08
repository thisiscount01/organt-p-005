import sys
sys.path.insert(0, "/tmp/pylibs")
from playwright.sync_api import sync_playwright

CHROME = "/tmp/pw/bpath/chromium-1117/chrome-linux/chrome"
URL = "https://organt-p-005-huc4.onrender.com/"

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox", "--disable-dev-shm-usage"])
    page = browser.new_page()
    msgs = []
    page.on("console", lambda m: msgs.append(f"{m.type}: {m.text}"))
    page.on("pageerror", lambda e: msgs.append(f"pageerror: {e}"))
    page.goto(URL, wait_until="networkidle")
    page.wait_for_timeout(500)
    print("activeElement tag before blur:", page.evaluate("document.activeElement && document.activeElement.tagName"))
    print("body has #depth-rail a count:", page.evaluate("document.querySelectorAll('#depth-rail a').length"))
    print("scrollY before:", page.evaluate("window.scrollY"))
    page.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
    print("activeElement tag after blur:", page.evaluate("document.activeElement && document.activeElement.tagName"))
    page.keyboard.press("j")
    page.wait_for_timeout(400)
    print("scrollY after j:", page.evaluate("window.scrollY"))
    print("data-depth after j:", page.evaluate("document.body.getAttribute('data-depth')"))
    page.keyboard.press("End")
    page.wait_for_timeout(600)
    print("scrollY after End:", page.evaluate("window.scrollY"))
    print("data-depth after End:", page.evaluate("document.body.getAttribute('data-depth')"))
    print("console/page messages:")
    for m in msgs:
        print(" ", m)
    browser.close()
