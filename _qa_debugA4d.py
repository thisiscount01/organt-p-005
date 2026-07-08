import sys
sys.path.insert(0, "/tmp/pylibs")
from playwright.sync_api import sync_playwright

CHROME = "/tmp/pw/bpath/chromium-1117/chrome-linux/chrome"
URL = "https://organt-p-005-huc4.onrender.com/"

VIEWPORTS = [
    (1280, 720, "common laptop"),
    (1366, 768, "most common laptop"),
    (1920, 1080, "FHD desktop"),
    (390, 844, "iPhone 12/13"),
    (412, 915, "common android"),
]

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for w, h, label in VIEWPORTS:
        page = browser.new_page(viewport={"width": w, "height": h})
        page.goto(URL, wait_until="networkidle")
        page.wait_for_timeout(400)
        max_ratio = 0
        triggered = False
        for i in range(80):
            page.mouse.wheel(0, 120)
            page.wait_for_timeout(40)
            rect = page.evaluate("document.getElementById('intake').getBoundingClientRect()")
            ih = page.evaluate("window.innerHeight")
            ratio = max(0, (min(rect['bottom'], ih) - max(rect['top'], 0))) / rect['height']
            max_ratio = max(max_ratio, ratio)
            active = page.evaluate("document.activeElement && document.activeElement.id")
            if active == "intake-answer":
                triggered = True
        page.wait_for_timeout(600)
        active_final = page.evaluate("document.activeElement && document.activeElement.id")
        print(f"{label} {w}x{h}: max_ratio={max_ratio:.3f} triggered={triggered} final_active={active_final!r}")
        page.close()
    browser.close()
