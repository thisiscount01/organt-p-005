import http.server, socketserver, threading, os
os.chdir("/tmp/vfix2/public")
srv = socketserver.TCPServer(("127.0.0.1", 8897), http.server.SimpleHTTPRequestHandler)
srv.allow_reuse_address = True
threading.Thread(target=srv.serve_forever, daemon=True).start()
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 375, "height": 780}, device_scale_factor=2)
    pg.goto("http://127.0.0.1:8897/index.html", wait_until="networkidle")
    pg.wait_for_timeout(700)
    out = pg.evaluate("""() => {
      const minTickLeft = Math.min(...[...document.querySelectorAll('#depth-rail .tick')].map(t=>t.getBoundingClientRect().left));
      // actual rendered TEXT extent per tagline via Range
      const tags = [...document.querySelectorAll('.depth-tagline')].map(t=>{
        const rng = document.createRange(); rng.selectNodeContents(t);
        const rects = [...rng.getClientRects()];
        const textRight = rects.length ? Math.max(...rects.map(r=>r.right)) : t.getBoundingClientRect().right;
        return {textRight: Math.round(textRight)};
      });
      const worst = Math.max(...tags.map(t=>t.textRight));
      return {minTickLeft: Math.round(minTickLeft), tags, worst: Math.round(worst)};
    }""")
    print("min tick left:", out["minTickLeft"])
    print("tagline text rights:", [t["textRight"] for t in out["tags"]])
    m=out["minTickLeft"]; w=out["worst"]
    print(f"worst tagline TEXT right = {w} vs tick left = {m} -> {'CLEAR by '+str(m-w)+'px' if w<=m else 'OVERLAP by '+str(w-m)+'px'}")
    pg.screenshot(path="/tmp/vfix2/fold_mobile_v3.png", clip={"x":0,"y":0,"width":375,"height":780})
    b.close()
srv.shutdown()
print("DONE")
