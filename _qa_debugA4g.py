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
        best = None
        for i in range(90):
            page.mouse.wheel(0, 80)
            page.wait_for_timeout(180)  # generous settle for smooth-scroll animation
            sy = page.evaluate("window.scrollY")
            rect = page.evaluate("document.getElementById('intake').getBoundingClientRect()")
            ratio = max(0, (min(rect['bottom'], h) - max(rect['top'], 0))) / rect['height']
            if ratio > max_ratio:
                max_ratio = ratio
                best = sy
            active = page.evaluate("document.activeElement && document.activeElement.id")
            if active == "intake-answer":
                print(f"{w}x{h}: AUTOFOCUS TRIGGERED at step {i} scrollY={sy} ratio={ratio:.4f}")
                break
        print(f"{w}x{h}: max_ratio={max_ratio:.4f} at scrollY={best}")
        page.close()
    browser.close()
