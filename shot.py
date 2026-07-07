import http.server, socketserver, threading, os, sys
os.chdir("public")
srv = socketserver.TCPServer(("127.0.0.1", 8894), http.server.SimpleHTTPRequestHandler)
srv.allow_reuse_address = True
threading.Thread(target=srv.serve_forever, daemon=True).start()
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch()
    for w,h,tag in [(1280,900,"desktop"),(375,780,"mobile")]:
        pg = b.new_page(viewport={"width":w,"height":h}, device_scale_factor=2)
        pg.goto("http://127.0.0.1:8894/index.html", wait_until="networkidle")
        pg.wait_for_timeout(900)
        pg.screenshot(path=f"/tmp/fold_{tag}.png")
        # measure counted blocks in first viewport
        info = pg.evaluate("""() => {
          const vh = innerHeight;
          const vis = [...document.querySelectorAll('.emph-focal,.emph-support,.a-code-line,.depth-microlabel,.depth-tagline,.support-slot')]
            .filter(e=>{const r=e.getBoundingClientRect(); return r.top<vh-8 && r.bottom>8 && r.width>0;})
            .map(e=>({cls:e.className, t:Math.round(e.getBoundingClientRect().top), txt:(e.textContent||'').trim().slice(0,40)}));
          return {vh, count:vis.length, vis};
        }""")
        print(tag, "->", info["count"], "blocks in fold")
        for v in info["vis"]:
            print("   ", v["t"], "|", v["cls"], "|", v["txt"])
        pg.close()
    b.close()
srv.shutdown()
