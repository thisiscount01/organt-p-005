# scratch probe (owner: frontend) — Task 112204-1 redo round
# 로컬 app.js가 라이브 배포 대비 앞서있다는 실측(35455B vs 34336B, intakeAutoDismissed 0건)에
# 따라 로컬 소스가 원문 REQ1/REQ2 + PM 체인회귀(Escape 후 지연 재포커스) + QA 임계값(1280x720/
# 1366x768 autofocus)까지 전부 실제로 만족하는지 재확인. keyboard.press/dispatchEvent만 사용,
# .value 직접대입 금지. 서버는 /tmp/fe_ddp(ASCII 경로 사본, 로컬과 바이트 동일 확인됨)에서
# 이미 PORT=4173으로 기동 중(이 run 호출 밖에서 백그라운드 유지 안 되므로 이 스크립트 실행
# run 호출에도 서버 기동을 함께 묶는다).
import sys, time, json
sys.path.insert(0, "/tmp/pylibs")
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4173"

def active_info(pg):
    return pg.evaluate("""()=>document.activeElement ?
        {tag: document.activeElement.tagName, id: document.activeElement.id} : null""")

results = []
def check(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(("PASS" if cond else "FAIL"), name, "-", extra)

errs = []
with sync_playwright() as p:
    b = p.chromium.launch()

    # ===== (a) REQ1: 빈 #intake-answer 포커스 -> j k 1 2 3 4 글자로 타이핑 =====
    ctx = b.new_context(viewport={"width": 1366, "height": 768})
    pg = ctx.new_page()
    pg.on("console", lambda m: (errs.append(m.text) if m.type == "error" else None))
    pg.on("pageerror", lambda e: errs.append("PAGEERROR:" + str(e)))
    pg.goto(BASE, wait_until="networkidle")
    time.sleep(0.3)
    pg.click("#intake-answer")
    for key in ["j", "k", "1", "2", "3", "4"]:
        pg.keyboard.press(key)
    val = pg.eval_on_selector("#intake-answer", "el=>el.value")
    check("REQ1 empty-field jk1234 typed literally", val == "jk1234", json.dumps(val))
    ctx.close()

    # ===== (b) REQ2: 포커스 없음 -> depth-jump로 배지(data-depth) 실변화 =====
    ctx = b.new_context(viewport={"width": 1366, "height": 768})
    pg = ctx.new_page()
    pg.on("console", lambda m: (errs.append(m.text) if m.type == "error" else None))
    pg.goto(BASE, wait_until="networkidle")
    time.sleep(0.3)
    pg.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
    d0 = pg.evaluate("()=>document.body.getAttribute('data-depth')")
    seq = []
    for key in ["j", "4", "k", "1"]:
        pg.keyboard.press(key)
        time.sleep(0.6)
        d = pg.evaluate("()=>document.body.getAttribute('data-depth')")
        seq.append((key, d))
    changed = len(set(d for _, d in seq)) > 1 or seq[0][1] != d0
    check("REQ2 unfocused depth-jump changes badge", changed, json.dumps([d0] + seq))
    ctx.close()

    # ===== (c) PM 체인: click(#intake-answer) -> Escape -> 900ms+ 대기 -> j 3연타 =====
    ctx = b.new_context(viewport={"width": 1366, "height": 768})
    pg = ctx.new_page()
    pg.on("console", lambda m: (errs.append(m.text) if m.type == "error" else None))
    pg.goto(BASE, wait_until="networkidle")
    time.sleep(0.3)
    pg.click("#intake-answer")
    a0 = active_info(pg)
    check("PM-chain c0 click focuses intake", a0 and a0["id"] == "intake-answer", json.dumps(a0))

    pg.keyboard.press("Escape")
    time.sleep(0.05)
    a1 = active_info(pg)
    check("PM-chain c1 escape blurs", not (a1 and a1["id"] == "intake-answer"), json.dumps(a1))

    time.sleep(0.9)  # 900ms+
    a2 = active_info(pg)
    check("PM-chain c2 after 900ms+ still not refocused", not (a2 and a2["id"] == "intake-answer"), json.dumps(a2))

    for i in range(3):
        pg.keyboard.press("j")
        time.sleep(0.5)
        a = active_info(pg)
        stolen = a and a["id"] == "intake-answer"
        check(f"PM-chain c3.{i+1} j-press #{i+1} no refocus-steal", not stolen, json.dumps(a))
    ctx.close()

    # ===== (d) 1280x720 / 1366x768: scrollTo(bottom) 이후 autofocus 발화 확인 =====
    for w, h in [(1280, 720), (1366, 768)]:
        ctx = b.new_context(viewport={"width": w, "height": h})
        pg = ctx.new_page()
        pg.on("console", lambda m: (errs.append(m.text) if m.type == "error" else None))
        pg.goto(BASE, wait_until="networkidle")
        time.sleep(0.3)
        pg.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        fired = False
        a = None
        for _ in range(30):
            time.sleep(0.15)
            a = active_info(pg)
            if a and a["id"] == "intake-answer":
                fired = True
                break
        check(f"autofocus fires on scrollTo(bottom) at {w}x{h}", fired, json.dumps(a))
        ctx.close()

    check("Z no console errors during whole run", len(errs) == 0, json.dumps(errs))
    b.close()

overall = all(ok for _, ok, _ in results)
print("=====RESULTS=====")
print("OVERALL", "PASS" if overall else "FAIL")
print("CONSOLE_ERRORS", json.dumps(errs))
