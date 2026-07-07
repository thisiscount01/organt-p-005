import http.server, socketserver, threading, os
os.chdir("/tmp/vfix2/public")
srv = socketserver.TCPServer(("127.0.0.1", 8896), http.server.SimpleHTTPRequestHandler)
srv.allow_reuse_address = True
threading.Thread(target=srv.serve_forever, daemon=True).start()
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 375, "height": 780}, device_scale_factor=2)
    pg.goto("http://127.0.0.1:8896/index.html", wait_until="networkidle")
    pg.wait_for_timeout(700)
    out = pg.evaluate("""() => {
      const ticks = [...document.querySelectorAll('#depth-rail a .tick, #depth-rail .tick')]
        .map(t=>{const r=t.getBoundingClientRect(); return {left:Math.round(r.left), right:Math.round(r.right), top:Math.round(r.top)};});
      const tags = [...document.querySelectorAll('.depth-tagline')].map(t=>{
        const r=t.getBoundingClientRect();
        return {top:Math.round(r.top), bottom:Math.round(r.bottom), right:Math.round(r.right)};
      });
      const tickLefts = ticks.map(t=>t.left);
      const minTickLeft = tickLefts.length ? Math.min(...tickLefts) : null;
      return {ticks, tags, minTickLeft};
    }""")
    print("min tick left edge:", out["minTickLeft"])
    print("ticks:", out["ticks"])
    print("taglines:", out["tags"])
    ml = out["minTickLeft"]
    if ml is not None:
        worst = max((t["right"] for t in out["tags"]), default=0)
        print(f"worst tagline right = {worst} vs min tick left = {ml} -> {'CLEAR' if worst <= ml else 'OVERLAP by '+str(worst-ml)+'px'}")
    pg.screenshot(path="/tmp/vfix2/fold_mobile_fixed.png")
    b.close()
srv.shutdown()
print("DONE")
