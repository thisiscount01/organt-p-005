import sys
sys.path.insert(0, "/tmp/pylibs")
from playwright.sync_api import sync_playwright

CHROME = "/tmp/pw/bpath/chromium-1117/chrome-linux/chrome"
URL = "https://organt-p-005-huc4.onrender.com/"

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for w, h in [(1280, 720), (1366, 768)]:
        page = browser.new_page(viewport={"width": w, "height": h})
        page.goto(URL, wait_until="networkidle")
        page.wait_for_timeout(400)
        max_ratio = 0
        best_sy = None
        # fine sweep across the exact scrollY range where intake overlaps viewport
        rect0 = page.evaluate("document.getElementById('intake').getBoundingClientRect()")
        sy0 = page.evaluate("window.scrollY")
        intake_top_doc = rect0['top'] + sy0
        intake_h = rect0['height']
        lo = int(intake_top_doc - h)
        hi = int(intake_top_doc + intake_h)
        for sy in range(lo, hi, 10):
            page.evaluate(f"window.scrollTo(0, {sy})")
            page.wait_for_timeout(20)
            rect = page.evaluate("document.getElementById('intake').getBoundingClientRect()")
            ratio = max(0, (min(rect['bottom'], h) - max(rect['top'], 0))) / rect['height']
            if ratio > max_ratio:
                max_ratio = ratio
                best_sy = sy
        print(f"{w}x{h}: TRUE max_ratio={max_ratio:.4f} at scrollY={best_sy} (intake_top_doc={intake_top_doc:.1f} h={intake_h:.1f} viewport_h={h})")
        page.close()
    browser.close()
