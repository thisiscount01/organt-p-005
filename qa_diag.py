import time
from playwright.sync_api import sync_playwright

URL = "https://organt-p-005-huc4.onrender.com/"

def run_once(idx):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        logs = []
        page.on("console", lambda m: logs.append(m.text))
        page.goto(URL, wait_until="networkidle")
        page.wait_for_timeout(200)

        # instrument: monkeypatch focusIntake calls count via wrapping setTimeout is hard;
        # instead poll activeElement + intake-answer value every 50ms for 1200ms after Escape.
        page.click("#intake-answer")
        a0 = page.evaluate("() => document.activeElement && document.activeElement.id")
        page.keyboard.press("Escape")
        t_escape = time.time()
        samples = []
        for i in range(24):  # ~1200ms in 50ms steps
            page.wait_for_timeout(50)
            active = page.evaluate("() => document.activeElement && document.activeElement.id")
            samples.append((round((time.time()-t_escape)*1000), active))
        print(f"[run {idx}] click->active={a0}  post-escape samples:")
        prev = None
        for t, act in samples:
            if act != prev:
                print(f"    t=+{t}ms activeElement={act}")
                prev = act
        ctx.close()
        browser.close()

for i in range(3):
    run_once(i)
