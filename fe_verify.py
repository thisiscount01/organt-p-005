import subprocess, time, json, os
env=dict(os.environ); env.pop("PYTHONPATH",None); env["PORT"]="3111"
srv=subprocess.Popen(["node","server.js"],cwd="/tmp/ddp_v1",env=env,
    stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
time.sleep(1.2)
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_page(viewport={"width":1280,"height":900})
    pg.on("console",lambda m:(errs.append(m.text) if m.type=="error" else None))
    pg.on("pageerror",lambda e:errs.append("PAGEERROR:"+str(e)))
    pg.goto("http://localhost:3111/",wait_until="networkidle")
    time.sleep(0.6)
    css=pg.evaluate("""()=>{
      const links=[...document.styleSheets].map(s=>s.href||'');
      const appI=links.findIndex(h=>h.includes('app.css'));
      const motI=links.findIndex(h=>h.includes('motion.css'));
      return {motionLoaded: motI>=0, orderOK: appI>=0 && motI>appI};
    }""")
    depths=pg.evaluate("()=>[...document.querySelectorAll('[data-depth]')].map(e=>e.getAttribute('data-depth'))")
    hero=pg.evaluate("()=>{const el=document.querySelector('.a-code-line');return el?getComputedStyle(el).animationName:null}")
    # scroll to bottom to trigger reveals across depths
    n_anim=pg.evaluate("()=>document.getAnimations().length")
    pg.evaluate("()=>window.scrollTo(0,document.body.scrollHeight)")
    time.sleep(0.8)
    n_anim2=pg.evaluate("()=>document.getAnimations().length")
    # mobile check
    pg.set_viewport_size({"width":375,"height":800})
    time.sleep(0.3)
    ovf=pg.evaluate("()=>document.documentElement.scrollWidth<=window.innerWidth")
    print("MOTION_CSS",json.dumps(css))
    print("DEPTHS",json.dumps(depths))
    print("HERO_ANIM",hero)
    print("GETANIM_INITIAL",n_anim,"AFTER_SCROLL",n_anim2)
    print("MOBILE_NO_OVERFLOW",ovf)
    b.close()
srv.terminate()
print("CONSOLE_ERRORS",json.dumps(errs))
