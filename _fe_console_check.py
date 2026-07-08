import sys
sys.path.insert(0, "/tmp/pylibs")
from playwright.sync_api import sync_playwright

CHROME = "/" + "tmp/pw/bpath/chromium-1117/chrome-linux/chrome"
errors = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = b.new_page()
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto("http://localhost:3000/", wait_until="networkidle")
    pg.wait_for_timeout(500)
    b.close()
print("console errors:", errors)
