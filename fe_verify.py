# scratch probe (owner: frontend)
# Task 112204-1 잔여 결함 재현: focusIntake()의 지연 setTimeout이 핸들 미저장으로 방치돼
# Escape blur/depth-jump 이동 뒤 420ms가 지나면 무조건 발동해 intake-answer로 강제
# 재포커스 -> depth-jump가 j/k/1-4 첫 키 이후 무력화됨(PM 실사용 체인 재현으로 확정).
# 수용기준(둘 다 동시 충족):
#   (1) 빈 #intake-answer에 포커스 있을 때 j/k/1-4는 여전히 글자로 타이핑됨.
#   (2) 포커스가 필드 밖일 때 같은 키는 depth-jump — 한 번 필드를 벗어나면(Escape blur
#       또는 depth-jump 이동) 나중에 예약된 지연 포커스가 되살아나 뺏어가지 않음.
# keyboard.press만 사용(.value 직접대입 금지) — PM: 단발 키 검증만으론 이 회귀가 안 잡힘.
import subprocess, time, json, os
env=dict(os.environ); env.pop("PYTHONPATH",None); env["PORT"]="3123"
srv=subprocess.Popen(["node","server.js"],cwd="/tmp/ddp_v2",env=env,
    stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
time.sleep(1.2)
from playwright.sync_api import sync_playwright

def active_info(pg):
    return pg.evaluate("""()=>document.activeElement ?
        {tag: document.activeElement.tagName, id: document.activeElement.id} : null""")

results = []
def check(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(("PASS" if cond else "FAIL"), name, "-", extra)

errs=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={"width":1440,"height":900})
    pg=ctx.new_page()
    pg.on("console",lambda m:(errs.append(m.text) if m.type=="error" else None))
    pg.on("pageerror",lambda e:errs.append("PAGEERROR:"+str(e)))
    pg.goto("http://localhost:3123/",wait_until="networkidle")
    time.sleep(0.5)

    # ===== 체인 A: 클릭(포커스) -> Escape(blur) -> 420ms+ 대기 -> j/k/1-4 연속 3회+ =====
    pg.click("#intake-answer")
    a = active_info(pg)
    check("A0 click focuses intake", a and a["id"] == "intake-answer", json.dumps(a))

    pg.keyboard.press("Escape")
    time.sleep(0.05)
    a = active_info(pg)
    check("A1 escape blurs", not (a and a["id"] == "intake-answer"), json.dumps(a))

    time.sleep(0.6)  # 원래 420ms 지연 포커스가 발동했을 시점 통과
    a = active_info(pg)
    check("A2 after 420ms+ still not refocused", not (a and a["id"] == "intake-answer"), json.dumps(a))

    for key in ["j", "k", "1", "2", "3", "4", "j", "k"]:
        pg.keyboard.press(key)
        time.sleep(0.5)  # smooth-scroll 안정화
        depth = pg.evaluate("()=>document.body.getAttribute('data-depth')")
        a = active_info(pg)
        stolen = a and a["id"] == "intake-answer"
        check(f"A3 key({key}) no refocus-steal", not stolen, f"active={json.dumps(a)} depth={depth}")

    # ===== 체인 B: 클릭 -> 빈 칸에 j/k/1/4 타이핑 -> value 축적 =====
    pg.goto("http://localhost:3123/",wait_until="networkidle")
    time.sleep(0.3)
    pg.click("#intake-answer")
    a = active_info(pg)
    check("B0 click focuses intake", a and a["id"] == "intake-answer", json.dumps(a))

    for key in ["j", "k", "1", "4"]:
        pg.keyboard.press(key)
    time.sleep(0.1)
    val = pg.eval_on_selector("#intake-answer", "el=>el.value")
    check("B1 typed value accumulates 'jk14'", val == "jk14", json.dumps(val))
    a = active_info(pg)
    check("B2 still focused after typing", a and a["id"] == "intake-answer", json.dumps(a))

    # ===== 체인 C: 인터섹션옵저버 autofocus 예약 중 depth-jump로 먼저 이동 -> 안 뺏김 =====
    pg.goto("http://localhost:3123/",wait_until="networkidle")
    time.sleep(0.3)
    last_y, stable = -1, 0
    for _ in range(60):
        pg.mouse.wheel(0, 600)
        time.sleep(0.05)
        y = pg.evaluate("()=>window.scrollY")
        if y == last_y:
            stable += 1
            if stable >= 3: break
        else:
            stable = 0
        last_y = y
    pg.keyboard.press("1")  # 예약된 420ms 타이머가 아직 대기 중일 시점에 명시적 이동
    time.sleep(0.7)  # 원래 예약 시각을 지나도록 대기
    a = active_info(pg)
    check("C0 goto() cancels pending autofocus timer", not (a and a["id"] == "intake-answer"), json.dumps(a))

    check("Z no console errors during whole run", len(errs) == 0, json.dumps(errs))
    b.close()
srv.terminate()

overall = all(ok for _, ok, _ in results)
print("=====RESULTS=====")
print("OVERALL", "PASS" if overall else "FAIL")
print("CONSOLE_ERRORS", json.dumps(errs))
