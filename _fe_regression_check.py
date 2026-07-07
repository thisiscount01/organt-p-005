import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
ok = True
def check(name, cond, extra=""):
    global ok
    ok = ok and bool(cond)
    print(("PASS" if cond else "FAIL"), name, "-", extra)

with sync_playwright() as p:
    br = p.chromium.launch(args=["--no-sandbox"])
    errors = []
    ctx = br.new_context(viewport={"width": 1280, "height": 800})
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append("PAGEERROR: " + str(e)))
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(500)
    check("0 page loaded, no console errors so far", len(errors) == 0, str(errors))

    # 회귀 재현: 빈 인테이크 입력칸에 포커스 후 "j" 입력 → 첫 글자 유실 없이 "j"가 찍혀야 함
    page.eval_on_selector("#intake-answer", "el => { el.value=''; el.focus(); }")
    page.keyboard.press("j")
    v1 = page.eval_on_selector("#intake-answer", "el => el.value")
    check("1 empty field + 'j' -> value=='j' (첫 글자 유실 없음)", v1 == "j", f"value={v1!r}")

    # 순수 이동 키(ArrowDown)는 "타이핑 중"(비어있지 않음)이면 여전히 입력칸 내부에서 소비돼야 함
    # (즉 depth-jump로 가로채여 값이 사라지면 안 됨)
    page.keyboard.press("ArrowDown")
    v2 = page.eval_on_selector("#intake-answer", "el => el.value")
    check("2 non-empty field + ArrowDown -> value 불변(포커스트랩 해제가 편집을 안 건드림)", v2 == v1, f"value={v2!r}")

    # 숫자 키도 동일 원칙("1"~"4"는 문자를 만드는 키이므로 필드 안에서 절대 가로채지 않음)
    page.eval_on_selector("#intake-answer", "el => { el.value=''; el.focus(); }")
    page.keyboard.press("2")
    v3 = page.eval_on_selector("#intake-answer", "el => el.value")
    check("3 empty field + '2' -> value=='2' (숫자 depth-jump 키도 필드 내부 우선)", v3 == "2", f"value={v3!r}")

    # 빈 입력칸일 때는 순수 이동 키(ArrowDown 등)가 포커스 트랩을 풀어야 함(회귀 아님, 기존 의도 보존 확인)
    page.eval_on_selector("#intake-answer", "el => { el.value=''; el.focus(); }")
    before_depth = page.evaluate("document.body.getAttribute('data-depth')")
    page.keyboard.press("ArrowDown")
    page.wait_for_timeout(700)
    after_active = page.evaluate("document.activeElement && document.activeElement.id")
    after_depth = page.evaluate("document.body.getAttribute('data-depth')")
    check("4 empty field + ArrowDown -> 포커스 트랩 해제(트랙 이동 발생)", after_active != "intake-answer" or after_depth != before_depth,
          f"active={after_active} depth {before_depth}->{after_depth}")

    check("5 console errors during whole run", len(errors) == 0, str(errors))
    br.close()

print("RESULT:", "ALL PASS" if ok else "SOME FAIL")
sys.exit(0 if ok else 1)
