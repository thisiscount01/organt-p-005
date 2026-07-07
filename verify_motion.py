import http.server, socketserver, threading, os, json
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "public"))
srv = socketserver.TCPServer(("127.0.0.1", 8893), http.server.SimpleHTTPRequestHandler)
srv.allow_reuse_address = True
threading.Thread(target=srv.serve_forever, daemon=True).start()

from playwright.sync_api import sync_playwright

errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto("http://127.0.0.1:8893/index.html", wait_until="networkidle")
    init = pg.evaluate("document.getAnimations().length")
    for y in range(0, 6000, 600):
        pg.evaluate(f"window.scrollTo(0,{y})")
        pg.wait_for_timeout(110)
    after = pg.evaluate("document.getAnimations().length")
    reveals = pg.evaluate("document.querySelectorAll('.reveal.is-in').length")
    eas = pg.evaluate(
        "[...document.getAnimations()].map(a=>{try{return a.effect.getComputedTiming().easing}catch(e){return ''}}).filter(Boolean).slice(0,8)"
    )
    # honesty: any pure-linear easing among running motions?
    linear = [e for e in eas if e.strip() == "linear"]
    print("INIT", init, "AFTER_SCROLL", after, "REVEALS_IN", reveals)
    print("EASINGS", json.dumps(eas))
    print("LINEAR_COUNT", len(linear))
    print("ERRORS", json.dumps(errs))
    b.close()
srv.shutdown()
