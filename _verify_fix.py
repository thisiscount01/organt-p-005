import http.server, socketserver, threading, os
os.chdir("public")
srv = socketserver.TCPServer(("127.0.0.1", 8895), http.server.SimpleHTTPRequestHandler)
srv.allow_reuse_address = True
threading.Thread(target=srv.serve_forever, daemon=True).start()
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h, tag in [(1280, 900, "desktop"), (375, 780, "mobile")]:
        pg = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=2)
        errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.goto("http://127.0.0.1:8895/index.html", wait_until="networkidle")
        pg.wait_for_timeout(800)
        out = pg.evaluate("""() => {
          const R = {};
          // ghost ::before content per depth + intake
          const g = {};
          for (const id of ['surface','bytecode','interpreter','memory']) {
            const st = document.querySelector(`.depth-panel[data-depth="${id}"] .depth-stage`);
            g[id] = st ? getComputedStyle(st, '::before').content : null;
          }
          const intake = document.querySelector('.intake');
          g['intake'] = intake ? getComputedStyle(intake, '::before').content : null;
          R.ghost = g;
          // micro-labels
          R.micro = [...document.querySelectorAll('.depth-microlabel')].slice(0,4).map(e=>e.textContent.trim());
          // horizontal scroll
          R.hscroll = document.documentElement.scrollWidth > innerWidth;
          R.scrollW = document.documentElement.scrollWidth; R.innerW = innerWidth;
          // mobile tagline vs rail collision: rail left edge vs each tagline right edge
          const rail = document.querySelector('#depth-rail');
          const railBox = rail ? rail.getBoundingClientRect() : null;
          R.railLeft = railBox ? Math.round(railBox.left) : null;
          R.taglines = [...document.querySelectorAll('.depth-tagline')].map(t=>{
            const r=t.getBoundingClientRect();
            return {right: Math.round(r.right), clears: railBox ? r.right <= railBox.left : true};
          });
          // fold count (surface first viewport)
          const vh=innerHeight;
          R.fold = [...document.querySelectorAll('.emph-focal,.support-slot')]
            .filter(e=>{const r=e.getBoundingClientRect(); return r.top<vh-8 && r.bottom>8 && r.width>0;}).length;
          return R;
        }""")
        print(f"\n=== {tag} ({w}x{h}) ===")
        print(" ghost :", out["ghost"])
        print(" micro :", out["micro"])
        print(" hscroll:", out["hscroll"], f'(scrollW={out["scrollW"]} innerW={out["innerW"]})')
        print(" railLeft:", out["railLeft"])
        print(" taglines:", out["taglines"])
        print(" fold-counted blocks:", out["fold"])
        print(" console errors:", errs or "none")
        pg.close()
    b.close()
srv.shutdown()
print("\nDONE")
