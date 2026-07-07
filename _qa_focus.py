import http.server, socketserver, threading, os
ROOT = "/" + "tmp/qaX/public"
os.chdir(ROOT)
PORT = 8913
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.TCPServer(("127.0.0.1", PORT), Q)
srv.allow_reuse_address = True
threading.Thread(target=srv.serve_forever, daemon=True).start()
LOG="/"+"tmp/qa_focus.txt"; open(LOG,"w").close()
def w(s):
    print(s)
    with open(LOG,"a") as f: f.write(s+"\n")
from playwright.sync_api import sync_playwright
CHROME = "/" + "tmp/pw/bpath/chromium-1117/chrome-linux/chrome"
base=f"http://127.0.0.1:{PORT}/index.html"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox","--disable-dev-shm-usage"])

    # (a) direct hash load autofocus, desktop
    ctx=b.new_context(viewport={"width":1280,"height":900}); pg=ctx.new_page()
    pg.goto(base+"#intake", wait_until="networkidle"); pg.wait_for_timeout(1000)
    w("(a) load with #intake -> activeElement id=%r" % pg.evaluate("()=>document.activeElement&&document.activeElement.id"))
    ctx.close()

    # (b) coda CTA click autofocus, desktop
    ctx=b.new_context(viewport={"width":1280,"height":900}); pg=ctx.new_page()
    pg.goto(base, wait_until="networkidle"); pg.wait_for_timeout(500)
    pg.evaluate("document.querySelector('#coda').scrollIntoView()"); pg.wait_for_timeout(400)
    pg.click("#coda-cta"); pg.wait_for_timeout(900)
    w("(b) coda CTA click -> activeElement id=%r" % pg.evaluate("()=>document.activeElement&&document.activeElement.id"))
    ctx.close()

    # (c) scroll-into-view autofocus + section height vs viewport (desktop & mobile)
    for wv,hv,tag in [(1280,900,"desktop"),(375,780,"mobile")]:
        ctx=b.new_context(viewport={"width":wv,"height":hv}); pg=ctx.new_page()
        pg.goto(base, wait_until="networkidle"); pg.wait_for_timeout(500)
        dims = pg.evaluate("""() => {
          const s=document.querySelector('#intake'); const r=s.getBoundingClientRect();
          return {h:Math.round(r.height), vh:innerHeight, ratioIfTop: Math.min(1, innerHeight/r.height)};
        }""")
        pg.evaluate("document.querySelector('#intake').scrollIntoView({block:'start'})")
        pg.wait_for_timeout(1200)
        af = pg.evaluate("()=>document.activeElement&&document.activeElement.id")
        maxvis = pg.evaluate("""() => {
          const s=document.querySelector('#intake'); const r=s.getBoundingClientRect();
          const vis=Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(r.top,0));
          return Math.round(vis/r.height*100);
        }""")
        w("(c-%s) intake height=%dpx vh=%d  maxVisibleRatio=%d%% (autofocus IO threshold=55%%) -> activeElement=%r"
          % (tag, dims["h"], dims["vh"], maxvis, af))
        ctx.close()
    b.close()
srv.shutdown()
w("FOCUS DONE")
