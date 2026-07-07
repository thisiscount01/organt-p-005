import http.server, socketserver, threading, os, sys
ROOT = "/" + "tmp/qaX/public"
os.chdir(ROOT)
PORT = 8911
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.TCPServer(("127.0.0.1", PORT), Q)
srv.allow_reuse_address = True
threading.Thread(target=srv.serve_forever, daemon=True).start()

LOG = "/" + "tmp/qa_desktop.txt"
def w(s):
    print(s)
    with open(LOG, "a") as f: f.write(s + "\n")
open(LOG, "w").close()

from playwright.sync_api import sync_playwright
URL = f"http://127.0.0.1:{PORT}/index.html"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/" + "tmp/pw/bpath/chromium-1117/chrome-linux/chrome",
                          args=["--no-sandbox","--disable-dev-shm-usage"])
    errs = []
    ctx = b.new_context(viewport={"width":1280,"height":900}, device_scale_factor=1)
    pg = ctx.new_page()
    pg.on("console", lambda m: errs.append(m.type+": "+m.text) if m.type in ("error","warning") else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERROR: "+str(e)))
    resp = pg.goto(URL, wait_until="networkidle")
    pg.wait_for_timeout(900)
    w("HTTP status index.html: %s" % (resp.status if resp else "none"))

    # first fold analysis
    fold = pg.evaluate("""() => {
      const vh = innerHeight;
      const inFold = e => { const r=e.getBoundingClientRect(); return r.top < vh-4 && r.bottom > 4 && r.width>1 && r.height>1; };
      const firstCode = document.querySelector('.a-code-line');
      const codeTxt = firstCode ? firstCode.textContent.trim() : null;
      // top-level content blocks in first depth stage
      const stage = document.querySelector('.depth-panel .depth-stage');
      const blocks = stage ? [...stage.children].filter(inFold).map(e=>({cls:e.className.split(' ')[0], txt:(e.textContent||'').trim().slice(0,50)})) : [];
      // count "counted core blocks" = direct visible children of first stage
      // also list all visible support slots in fold anywhere
      const supportInFold = [...document.querySelectorAll('.support-slot')].filter(inFold).length;
      return {vh, codeTxt, blocks, blockCount: blocks.length, supportInFold,
              codeInFold: firstCode ? inFold(firstCode) : false};
    }""")
    w("first code line text: %r  (in fold: %s)" % (fold["codeTxt"], fold["codeInFold"]))
    w("first-stage visible top blocks: %d" % fold["blockCount"])
    for bl in fold["blocks"]:
        w("   block: %s | %s" % (bl["cls"], bl["txt"]))
    w("support slots visible in fold: %d" % fold["supportInFold"])
    pg.screenshot(path="/" + "tmp/qa5_fold_desktop.png")

    # scroll through and collect depth content + support artifacts text
    depths = pg.evaluate("""() => {
      return [...document.querySelectorAll('.depth-panel')].map(p=>({
        id: p.getAttribute('data-depth'),
        micro: (p.querySelector('.depth-microlabel')||{}).textContent||'',
        tag: (p.querySelector('.depth-tagline')||{}).textContent||'',
        support: [...p.querySelectorAll('.support-slot')].map(s=>s.textContent.trim().replace(/\\s+/g,' ').slice(0,90))
      }));
    }""")
    w("--- DEPTHS (%d) ---" % len(depths))
    for d in depths:
        w("[%s] %s" % (d["id"], d["micro"]))
        w("   tagline: %s" % d["tag"][:80])
        for s in d["support"]:
            w("   support: %s" % s)

    # scroll to bottom, capture coda + full-page evidence
    pg.evaluate("window.scrollTo(0, document.querySelector('#coda').offsetTop)")
    pg.wait_for_timeout(700)
    coda = pg.evaluate("""() => {
      const c=document.querySelector('#coda'); const h=document.querySelector('#coda-headline');
      const cta=document.querySelector('#coda-cta');
      return {hidden:c.hidden, headline:(h.textContent||'').replace(/\\s+/g,' ').trim(), cta:(cta.textContent||'').trim(),
              visible: c.getBoundingClientRect().top < innerHeight};
    }""")
    w("--- CODA --- hidden=%s cta=%r" % (coda["hidden"], coda["cta"]))
    w("   headline: %s" % coda["headline"][:160])
    pg.screenshot(path="/" + "tmp/qa5_coda_desktop.png")

    # depth rail present + count
    rail = pg.evaluate("() => document.querySelectorAll('#depth-rail a').length")
    w("depth-rail jump links: %d" % rail)

    w("--- CONSOLE errors/warnings: %d ---" % len(errs))
    for e in errs[:20]: w("   "+e)
    ctx.close(); b.close()
srv.shutdown()
w("DESKTOP DONE")
