import sys
sys.path.insert(0, "/tmp/pylibs")
from playwright.sync_api import sync_playwright

CHROME = "/" + "tmp/pw/bpath/chromium-1117/chrome-linux/chrome"
URL = "http://localhost:3000/"

TYPE_KEYS = ["j", "k", "1", "2", "3", "4"]
NAV_ONLY_KEYS = ["ArrowDown", "ArrowUp", "PageDown", "PageUp"]  # textarea에서도 캐럿만 움직여 값은 안 남음
NAV_KEYS = TYPE_KEYS + NAV_ONLY_KEYS + ["Home", "End"]

fails = []

def settle_scroll(page, tries=20):
    last = None
    for _ in range(tries):
        page.wait_for_timeout(60)
        y = page.evaluate("window.scrollY")
        if y == last:
            return y
        last = y
    return last

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox", "--disable-dev-shm-usage"])

    # ---- 기준 (1): 빈 인테이크 입력칸 포커스 시 — 전부 타이핑, depth-jump 없음 ----
    # (literal 기준은 j/k/1-4뿐 — PageUp/PageDown은 textarea가 내부스크롤 불필요분을
    #  브라우저 네이티브 기본동작으로 페이지에 위임하는 것이 정상이라 스코프 밖으로 정보성만 출력)
    for key in NAV_KEYS:
        page = browser.new_page()
        page.goto(URL, wait_until="networkidle")
        ta = page.query_selector("#intake-answer")
        ta.click()
        scroll_before = page.evaluate("window.scrollY")
        ta.press(key)
        page.wait_for_timeout(300)
        val = ta.input_value()
        scroll_after = page.evaluate("window.scrollY")
        active_tag = page.evaluate("document.activeElement && document.activeElement.tagName")
        print(f"[FOCUSED] key={key!r} value={val!r} scroll {scroll_before}->{scroll_after} active={active_tag}")
        if key in TYPE_KEYS:
            if val != key:
                fails.append(f"FOCUSED key={key!r}: 타이핑 안 됨 (value={val!r}, 기대={key!r})")
            if scroll_after != scroll_before:
                fails.append(f"FOCUSED key={key!r}: depth-jump 발생(스크롤 {scroll_before}->{scroll_after}) — 타이핑만 돼야 함(리터럴 기준 키)")
        if active_tag != "TEXTAREA":
            fails.append(f"FOCUSED key={key!r}: 포커스가 textarea에서 이탈함(active={active_tag})")
        page.close()

    # ---- 기준 (2): 입력칸 미포커스 시 — 같은 키가 depth-jump 네비게이션 ----
    # 방향키는 시작 위치에 따라 '이미 그 자리라 이동 없음'이 정상일 수 있어(예: 맨 위에서 k/1/ArrowUp),
    # 아래로 가는 키는 맨 위에서, 위로 가는 키는 맨 아래(End로 선이동)에서 관찰해야 실제 이동을 볼 수 있다.
    DOWN_KEYS = ["j", "ArrowDown", "PageDown", "2", "3", "4", "End"]
    UP_KEYS = ["k", "ArrowUp", "PageUp", "1", "Home"]

    for key in DOWN_KEYS:
        page = browser.new_page()
        page.goto(URL, wait_until="networkidle")
        page.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
        scroll_before = page.evaluate("window.scrollY")  # 최상단(0)
        page.keyboard.press(key)
        scroll_after = settle_scroll(page)
        active_tag = page.evaluate("document.activeElement && document.activeElement.tagName")
        moved = scroll_after != scroll_before
        print(f"[UNFOCUSED/DOWN] key={key!r} scroll {scroll_before}->{scroll_after} moved={moved} active={active_tag}")
        if not moved:
            fails.append(f"UNFOCUSED key={key!r}: 맨 위에서 눌러도 스크롤 변화 없음 — depth-jump 미동작")
        if active_tag == "TEXTAREA":
            fails.append(f"UNFOCUSED key={key!r}: 의도치 않게 textarea에 포커스됨")
        page.close()

    for key in UP_KEYS:
        page = browser.new_page()
        page.goto(URL, wait_until="networkidle")
        page.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
        page.keyboard.press("End")  # 먼저 맨 아래로 이동
        bottom = settle_scroll(page)
        page.keyboard.press(key)
        scroll_after = settle_scroll(page)
        active_tag = page.evaluate("document.activeElement && document.activeElement.tagName")
        moved = scroll_after != bottom
        print(f"[UNFOCUSED/UP] key={key!r} scroll {bottom}->{scroll_after} moved={moved} active={active_tag}")
        if not moved:
            fails.append(f"UNFOCUSED key={key!r}: 맨 아래에서 눌러도 스크롤 변화 없음 — depth-jump 미동작")
        if active_tag == "TEXTAREA":
            fails.append(f"UNFOCUSED key={key!r}: 의도치 않게 textarea에 포커스됨")
        page.close()

    browser.close()

print("\n=== RESULT ===")
if fails:
    print(f"FAIL ({len(fails)}):")
    for f in fails:
        print(" -", f)
    sys.exit(1)
else:
    print("ALL PASS")
