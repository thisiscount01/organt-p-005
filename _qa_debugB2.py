import sys
sys.path.insert(0, "/tmp/pylibs")
from playwright.sync_api import sync_playwright

CHROME = "/tmp/pw/bpath/chromium-1117/chrome-linux/chrome"
URL = "https://organt-p-005-huc4.onrender.com/"

def dump(page, tag):
    sy = page.evaluate("window.scrollY")
    depth = page.evaluate("document.body.getAttribute('data-depth')")
    active = page.evaluate("document.querySelector('#depth-rail a[aria-current=\"true\"]') && document.querySelector('#depth-rail a[aria-current=\"true\"]').getAttribute('href')")
    print(f"{tag}: scrollY={sy} data-depth={depth} rail={active}")

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox", "--disable-dev-shm-usage"])
    page = browser.new_page()
    page.goto(URL, wait_until="networkidle")
    page.wait_for_timeout(400)
    dump(page, "initial")
    page.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
    page.keyboard.press("4")
    for i in range(15):
        page.wait_for_timeout(300)
        dump(page, f"after '4' t+{(i+1)*0.3:.1f}s")
    # panel geometry
    geo = page.evaluate("""() => {
      const panels = [...document.querySelectorAll('.depth-panel')];
      return panels.map(p => ({id: p.id, top: p.getBoundingClientRect().top + window.scrollY, h: p.offsetHeight}));
    }""")
    print("panel geometry (doc coords):", geo)
    root = page.evaluate("""() => {
      const root = document.querySelector('.depths-root') || document.querySelector('[data-depths-root]') || document.body;
      return null;
    }""")
    browser.close()
