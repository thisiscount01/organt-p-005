import sys
sys.path.insert(0, "/tmp/pylibs")
from playwright.sync_api import sync_playwright

CHROME = "/tmp/pw/bpath/chromium-1117/chrome-linux/chrome"
URL = "https://organt-p-005-huc4.onrender.com/"

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox", "--disable-dev-shm-usage"])
    page = browser.new_page()
    page.goto(URL, wait_until="networkidle")
    print("scrollHeight", page.evaluate("document.body.scrollHeight"))
    print("innerHeight", page.evaluate("window.innerHeight"))
    intake_rect_before = page.evaluate("document.getElementById('intake').getBoundingClientRect()")
    print("intake rect before scroll", intake_rect_before)
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(500)
    print("scrollY after jump", page.evaluate("window.scrollY"))
    intake_rect = page.evaluate("document.getElementById('intake').getBoundingClientRect()")
    print("intake rect after scroll", intake_rect)
    for i in range(6):
        page.wait_for_timeout(500)
        active = page.evaluate("document.activeElement && document.activeElement.id")
        print(f"t+{(i+1)*0.5:.1f}s active=", active)
    browser.close()
