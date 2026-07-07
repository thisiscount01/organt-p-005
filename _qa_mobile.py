import http.server, socketserver, threading, os
ROOT="/"+"tmp/qaX/public"; os.chdir(ROOT); PORT=8914
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(("127.0.0.1",PORT),Q); srv.allow_reuse_address=True
threading.Thread(target=srv.serve_forever,daemon=True).start()
LOG="/"+"tmp/qa_mobile.txt"; open(LOG,"w").close()
def w(s):
    print(s)
    with open(LOG,"a") as f: f.write(s+"\n")
from playwright.sync_api import sync_playwright
CHROME="/"+"tmp/pw/bpath/chromium-1117/chrome-linux/chrome"
base=f"http://127.0.0.1:{PORT}/index.html"
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=["--no-sandbox","--disable-dev-shm-usage"])
    # mobile normal
    errs=[]
    ctx=b.new_context(viewport={"width":375,"height":780},device_scale_factor=2); pg=ctx.new_page()
    pg.on("console",lambda m: errs.append(m.type+":"+m.text) if m.type=="error" else None)
    pg.on("pageerror",lambda e: errs.append("PAGEERROR:"+str(e)))
    pg.goto(base,wait_until="networkidle"); pg.wait_for_timeout(900)
    over=pg.evaluate("""() => {
      const de=document.documentElement;
      const hOverflow = de.scrollWidth > de.clientWidth + 1;
      // any element extending past viewport width
      const wide=[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.right>de.clientWidth+2 && r.width>0 && getComputedStyle(e).position!=='fixed';})
        .slice(0,6).map(e=>({cls:e.className&&e.className.toString().slice(0,30),right:Math.round(e.getBoundingClientRect().right)}));
      const code=document.querySelector('.a-code-line');
      return {clientW:de.clientWidth, scrollW:de.scrollWidth, hOverflow, wide,
              codeRight: code?Math.round(code.getBoundingClientRect().right):null,
              codeFits: code? code.getBoundingClientRect().right<=de.clientWidth+1 : null};
    }""")
    w("MOBILE overflow: clientW=%d scrollW=%d horizontalOverflow=%s" % (over["clientW"],over["scrollW"],over["hOverflow"]))
    w("  code-line right=%s fits=%s" % (over["codeRight"],over["codeFits"]))
    for e in over["wide"]: w("  WIDE: %s right=%s" % (e["cls"],e["right"]))
    pg.screenshot(path="/"+"tmp/qa5_fold_mobile.png", clip={"x":0,"y":0,"width":375,"height":780})
    # scroll to bytecode depth for mobile artifact readability
    pg.evaluate("document.querySelector('#depth-bytecode').scrollIntoView()"); pg.wait_for_timeout(700)
    pg.screenshot(path="/"+"tmp/qa5_bytecode_mobile.png", clip={"x":0,"y":0,"width":375,"height":780})
    w("MOBILE console errors: %d %s" % (len(errs), errs[:5]))
    ctx.close()

    # reduced motion
    ctx=b.new_context(viewport={"width":1280,"height":900}, reduced_motion="reduce"); pg=ctx.new_page()
    rerr=[]
    pg.on("pageerror",lambda e: rerr.append(str(e)))
    pg.goto(base,wait_until="networkidle"); pg.wait_for_timeout(700)
    rm=pg.evaluate("""() => {
      // are reveals visible (opacity ~1) under reduced motion, first depth?
      const rv=[...document.querySelectorAll('.depth-panel .reveal')].slice(0,4)
        .map(e=>({op:getComputedStyle(e).opacity, inn:(e.textContent||'').trim().slice(0,20)}));
      return {reveals:rv, reduceCSS: getComputedStyle(document.documentElement).getPropertyValue('--scroll-progress')};
    }""")
    w("REDUCED-MOTION pageerrors: %d" % len(rerr))
    for r in rm["reveals"]: w("  reveal opacity=%s : %s" % (r["op"], r["inn"]))
    ctx.close()
    b.close()
srv.shutdown(); w("MOBILE DONE")
