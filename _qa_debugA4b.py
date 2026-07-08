import sys
sys.path.insert(0, "/tmp/pylibs")
from playwright.sync_api import sync_playwright

CHROME = "/tmp/pw/bpath/chromium-1117/chrome-linux/chrome"
URL = "https://organt-p-005-huc4.onrender.com/"

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox", "--disable-dev-shm-usage"])
    page = browser.new_page()
    page.goto(URL, wait_until="networkidle")
    print("doc.scrollHeight", page.evaluate("document.documentElement.scrollHeight"))
    print("body.scrollHeight", page.evaluate("document.body.scrollHeight"))
    print("scrollingElement.scrollHeight", page.evaluate("document.scrollingElement.scrollHeight"))
    page.evaluate("window.scrollTo(0, 999999)")
    page.wait_for_timeout(300)
    print("scrollY after huge jump", page.evaluate("window.scrollY"))
    print("maxScroll computed", page.evaluate("document.scrollingElement.scrollHeight - window.innerHeight"))
    rect = page.evaluate("document.getElementById('intake').getBoundingClientRect()")
    print("intake rect", rect)
    ratio = (min(rect['bottom'],720) - max(rect['top'],0)) / rect['height']
    print("intersection ratio approx", ratio)
    # Now try real wheel scrolling in increments (simulate real user) from top
    page.goto(URL, wait_until="networkidle")
    for i in range(40):
        page.mouse.wheel(0, 300)
        page.wait_for_timeout(50)
    page.wait_for_timeout(300)
    print("scrollY after wheel loop", page.evaluate("window.scrollY"))
    rect2 = page.evaluate("document.getElementById('intake').getBoundingClientRect()")
    print("intake rect after wheel", rect2)
    for i in range(6):
        page.wait_for_timeout(500)
        active = page.evaluate("document.activeElement && document.activeElement.id")
        print(f"t+{(i+1)*0.5:.1f}s active=", active)
    browser.close()
