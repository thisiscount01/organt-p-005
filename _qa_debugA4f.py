import sys
sys.path.insert(0, "/tmp/pylibs")
from playwright.sync_api import sync_playwright

CHROME = "/tmp/pw/bpath/chromium-1117/chrome-linux/chrome"
URL = "https://organt-p-005-huc4.onrender.com/"

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox", "--disable-dev-shm-usage"])
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    page.goto(URL, wait_until="networkidle")
    page.wait_for_timeout(400)
    for sy in [3454, 3800, 4174, 4400, 4650, 4900, 5100, 5300, 5500, 5584, 5839]:
        page.evaluate(f"window.scrollTo(0, {sy})")
        page.wait_for_timeout(50)
        actual_sy = page.evaluate("window.scrollY")
        rect = page.evaluate("document.getElementById('intake').getBoundingClientRect()")
        h = 720
        ratio = max(0, (min(rect['bottom'], h) - max(rect['top'], 0))) / rect['height']
        print(f"target_sy={sy} actual_sy={actual_sy} rect_top={rect['top']:.1f} rect_bottom={rect['bottom']:.1f} ratio={ratio:.4f}")
    page.close()
    browser.close()
