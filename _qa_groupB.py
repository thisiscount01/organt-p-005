import sys
sys.path.insert(0, "/tmp/pylibs")
from playwright.sync_api import sync_playwright

CHROME = "/" + "tmp/pw/bpath/chromium-1117/chrome-linux/chrome"
URL = "https://organt-p-005-huc4.onrender.com/"

results = []

def log(n, desc, ok, detail):
    results.append((n, desc, ok, detail))
    print(f"[{n}] {'PASS' if ok else 'FAIL'} {desc} :: {detail}")

def get_depth_state(page):
    return page.evaluate("""() => {
        const active = document.querySelector('#depth-rail a[aria-current=\\"true\\"]');
        return {
            bodyDepth: document.body.getAttribute('data-depth'),
            railHref: active ? active.getAttribute('href') : null,
        };
    }""")

def settle(page, tries=25):
    # 스무스 스크롤 애니메이션이 실측상 ~0.9~1.0s 걸려 완전 정착한다 — 너무 촘촘히
    # 폴링하면 애니메이션 도중 우연히 두 샘플이 같아 보여(느린 초반 램프업) 조기
    # '정착'으로 오판할 수 있다. 최소 대기를 넉넉히 두고 연속 3회 동일해야 정착으로 본다.
    page.wait_for_timeout(1100)
    stable_count = 0
    last = None
    for _ in range(tries):
        d = get_depth_state(page)
        if d == last:
            stable_count += 1
            if stable_count >= 3:
                return d
        else:
            stable_count = 0
        last = d
        page.wait_for_timeout(120)
    return last

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox", "--disable-dev-shm-usage"])

    # 5. j -> next
    page = browser.new_page()
    page.goto(URL, wait_until="networkidle")
    page.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
    before = settle(page)
    page.keyboard.press("j")
    after = settle(page)
    log("B5", "unfocused 'j' -> depth badge advances", before != after, f"before={before} after={after}")
    page.close()

    # 6. k -> previous (from a real depth-panel stop, not the coda/intake dead-zone
    #    where data-depth is pinned to "memory" by design regardless of sub-position —
    #    starting from End(=intake) would make 'k' land on #coda, which is *also*
    #    pinned to "memory", producing a false negative unrelated to the keydown fix.)
    page = browser.new_page()
    page.goto(URL, wait_until="networkidle")
    page.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
    page.keyboard.press("4")  # digit jumps to the 4th depth-panel stop (memory), still within depths-root
    mid = settle(page)
    page.keyboard.press("k")
    after = settle(page)
    log("B6", "unfocused 'k' -> depth badge goes back", mid != after, f"mid={mid} after={after}")
    page.close()

    # 7. '1' -> depth 1 (surface)
    page = browser.new_page()
    page.goto(URL, wait_until="networkidle")
    page.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
    page.keyboard.press("End")
    settle(page)
    page.keyboard.press("1")
    after = settle(page)
    log("B7", "unfocused '1' -> depth badge = depth 1 (surface)",
        after["railHref"] == "#depth-surface" and after["bodyDepth"] == "surface", f"after={after}")
    page.close()

    # 8. '4' -> depth 4 (memory, last)
    page = browser.new_page()
    page.goto(URL, wait_until="networkidle")
    page.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
    before = settle(page)
    page.keyboard.press("4")
    after = settle(page)
    log("B8", "unfocused '4' -> depth badge = depth 4 (memory, last)",
        after["railHref"] == "#depth-memory" and after["bodyDepth"] == "memory", f"before={before} after={after}")
    page.close()

    browser.close()

print("\n=== SUMMARY B ===")
n_fail = sum(1 for r in results if not r[2])
for n, desc, ok, detail in results:
    print(f"{n}: {'PASS' if ok else 'FAIL'} - {desc}")
print(f"{len(results)-n_fail}/{len(results)} PASS")
sys.exit(1 if n_fail else 0)
