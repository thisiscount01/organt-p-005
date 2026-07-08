import sys
sys.path.insert(0, "/tmp/pylibs")
from playwright.sync_api import sync_playwright

CHROME = "/tmp/pw/bpath/chromium-1117/chrome-linux/chrome"
URL = "https://organt-p-005-huc4.onrender.com/"

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox", "--disable-dev-shm-usage"])
    page = browser.new_page()
    page.goto(URL, wait_until="networkidle")
    page.wait_for_timeout(500)  # let any late layout settle
    print("scrollingElement.scrollHeight", page.evaluate("document.scrollingElement.scrollHeight"))
    print("innerHeight", page.evaluate("window.innerHeight"))
    triggered_at = None
    for i in range(60):
        page.mouse.wheel(0, 150)
        page.wait_for_timeout(60)
        active = page.evaluate("document.activeElement && document.activeElement.id")
        rect = page.evaluate("document.getElementById('intake').getBoundingClientRect()")
        sy = page.evaluate("window.scrollY")
        ratio = max(0, (min(rect['bottom'], 720) - max(rect['top'], 0))) / rect['height']
        if i % 5 == 0 or active == "intake-answer":
            print(f"step={i} scrollY={sy} ratio={ratio:.3f} active={active}")
        if active == "intake-answer" and triggered_at is None:
            triggered_at = i
            print(">>> TRIGGERED at step", i)
    print("final scrollY", page.evaluate("window.scrollY"))
    print("triggered_at", triggered_at)
    browser.close()
