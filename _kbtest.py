from playwright.sync_api import sync_playwright
import subprocess, time, socket

srv = subprocess.Popen("node - < server.js", shell=True)
for _ in range(30):
    try:
        socket.create_connection(("127.0.0.1", 3000), 0.2).close(); break
    except OSError:
        time.sleep(0.1)

def run():
  with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto("http://127.0.0.1:3000/", wait_until="networkidle")
    ta = pg.query_selector("#intake-answer")
    assert ta, "no #intake-answer textarea"

    # REQ1: empty field focused -> j/k/1-4 type as chars
    ta.click(); ta.fill("")
    for ch in ["j", "k", "1", "2", "3", "4"]:
        pg.keyboard.press(ch)
    typed = pg.eval_on_selector("#intake-answer", "el=>el.value")
    print("REQ1 typed value =", repr(typed))
    assert typed == "jk1234", f"REQ1 FAIL: expected 'jk1234' got {typed!r}"

    # REQ2: focus NOT in field -> keys do depth-jump (scroll changes)
    pg.eval_on_selector("#intake-answer", "el=>el.blur()")
    pg.evaluate("window.scrollTo(0,0)")
    y0 = pg.evaluate("window.scrollY")
    pg.keyboard.press("j")
    time.sleep(0.6)
    y1 = pg.evaluate("window.scrollY")
    print(f"REQ2 scrollY {y0} -> {y1}")
    assert y1 > y0, f"REQ2 FAIL: 'j' did not navigate (scroll {y0}->{y1})"

    # REQ2b: numeric jump
    pg.keyboard.press("1"); time.sleep(0.4); yA = pg.evaluate("window.scrollY")
    pg.keyboard.press("4"); time.sleep(0.6); yB = pg.evaluate("window.scrollY")
    print(f"REQ2b '1'->{yA}  '4'->{yB}")
    assert yB != yA, "REQ2b FAIL: numeric depth-jump inert"

    print("console errors:", errs)
    print("ALL PASS")
    b.close()

run()
srv.terminate()
