import http.server, socketserver, threading, os
ROOT = "/" + "tmp/qaX/public"
os.chdir(ROOT)
PORT = 8912
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.TCPServer(("127.0.0.1", PORT), Q)
srv.allow_reuse_address = True
threading.Thread(target=srv.serve_forever, daemon=True).start()

LOG = "/" + "tmp/qa_intake.txt"
open(LOG,"w").close()
def w(s):
    print(s)
    with open(LOG,"a") as f: f.write(s+"\n")

from playwright.sync_api import sync_playwright
URL = f"http://127.0.0.1:{PORT}/index.html"
CHROME = "/" + "tmp/pw/bpath/chromium-1117/chrome-linux/chrome"
reqs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox","--disable-dev-shm-usage"])
    ctx = b.new_context(viewport={"width":1280,"height":900})
    pg = ctx.new_page()
    pg.on("requestfailed", lambda r: reqs.append(("FAILED", r.url)))
    pg.on("response", lambda r: reqs.append((r.status, r.url)) if "/api/intake" in r.url else None)
    pg.goto(URL, wait_until="networkidle")
    pg.wait_for_timeout(600)

    # jump to intake via keyboard 'End' or scroll
    pg.evaluate("document.querySelector('#intake').scrollIntoView()")
    pg.wait_for_timeout(900)
    active = pg.evaluate("() => document.activeElement && document.activeElement.id")
    w("after scroll-to-intake, activeElement id: %r (autofocus expects 'intake-answer')" % active)

    # first question text (cursor placed on first question)
    q1 = pg.evaluate("() => document.querySelector('#intake-question').textContent")
    w("first question: %s" % q1)

    # type an answer and submit with Enter
    pg.click("#intake-answer")
    pg.fill("#intake-answer", "저는 파이썬 인터프리터의 GIL 제거 실험(nogil)을 몇 달째 파고들고 있습니다.")
    pg.keyboard.press("Enter")
    pg.wait_for_timeout(500)
    c1 = pg.evaluate("""() => {
      const cards=[...document.querySelectorAll('#intake-cards .card-artifact')];
      return {count: document.querySelector('#intake-count').textContent,
              n: cards.length,
              first: cards[0] ? {kind:(cards[0].querySelector('.card-artifact__kind')||{}).textContent,
                                 depth:(cards[0].querySelector('.card-artifact__depth')||{}).textContent,
                                 body:(cards[0].querySelector('.card-artifact__body')||{}).textContent.slice(0,40),
                                 status:(cards[0].querySelector('.card-artifact__status')||{}).textContent,
                                 cls: cards[0].className} : null,
              qNow: document.querySelector('#intake-question').textContent};
    }""")
    w("after answer submit -> count=%s cards=%d" % (c1["count"], c1["n"]))
    w("   card0: %s" % c1["first"])
    w("   question advanced to: %s" % c1["qNow"])

    # paste an artifact (code) via real paste event on document (not in a textarea)
    pasted = pg.evaluate("""() => {
      try {
        const dt = new DataTransfer();
        dt.setData('text', 'def deep_dive(x):\\n    return x ** 2  # 붙여넣기 유물 테스트');
        const ev = new ClipboardEvent('paste', {clipboardData: dt, bubbles:true, cancelable:true});
        document.body.dispatchEvent(ev);
        return 'dispatched';
      } catch(e) { return 'ERR:'+e.message; }
    }""")
    pg.wait_for_timeout(400)
    c2 = pg.evaluate("""() => {
      const cards=[...document.querySelectorAll('#intake-cards .card-artifact')];
      return {count: document.querySelector('#intake-count').textContent, n: cards.length,
              kinds: cards.map(c=>(c.querySelector('.card-artifact__kind')||{}).textContent)};
    }""")
    w("paste dispatch result: %s" % pasted)
    w("after paste -> count=%s cards=%d kinds=%s" % (c2["count"], c2["n"], c2["kinds"]))

    # localStorage persistence
    ls = pg.evaluate("() => localStorage.getItem('deepdive:intake:v1')")
    w("localStorage bytes: %d, entries stored: %s" % (len(ls or ""), (ls[:120] if ls else None)))
    pg.screenshot(path="/" + "tmp/qa5_intake_desktop.png", full_page=False)

    # RELOAD -> persistence across revisit (goal 4)
    pg.reload(wait_until="networkidle")
    pg.wait_for_timeout(600)
    after = pg.evaluate("""() => {
      const cards=[...document.querySelectorAll('#intake-cards .card-artifact')];
      return {count: document.querySelector('#intake-count').textContent, n: cards.length,
              bodies: cards.map(c=>(c.querySelector('.card-artifact__body')||{}).textContent.slice(0,30))};
    }""")
    w("AFTER RELOAD -> count=%s cards=%d" % (after["count"], after["n"]))
    for bdy in after["bodies"]: w("   persisted card: %s" % bdy)

    w("--- /api/intake network events ---")
    for st,u in reqs:
        if "/api/intake" in u or st=="FAILED": w("   %s %s" % (st, u))
    ctx.close(); b.close()
srv.shutdown()
w("INTAKE DONE")
