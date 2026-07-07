import sys, os, glob, json

# --- locate playwright from an available venv (default python3 lacks it) ---
for pat in ("/root/ClaudeCompany/.venv/lib/python*/site-packages",
            "/root/_archive/PJT/.venv/lib/python*/site-packages"):
    for sp in glob.glob(pat):
        if sp not in sys.path:
            sys.path.insert(0, sp)
try:
    from playwright.sync_api import sync_playwright
except Exception as e:
    print("NO_PLAYWRIGHT", e); sys.exit(2)

BASE = "http://localhost:3000"
SHOTS = "/tmp/qa_dd"
os.makedirs(SHOTS, exist_ok=True)
R = []
def check(name, cond, extra=""):
    R.append((name, bool(cond), str(extra)))
    print(("PASS" if cond else "FAIL"), name, "-", str(extra)[:160], flush=True)

with sync_playwright() as p:
    br = p.chromium.launch(args=["--no-sandbox"])
    errors = []
    ctx = br.new_context(viewport={"width":1440,"height":900})
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(m.text) if m.type=="error" else None)
    page.on("pageerror", lambda e: errors.append("PAGEERROR:"+str(e)))
    page.goto(BASE, wait_until="networkidle"); page.wait_for_timeout(800)

    # ---------- CRIT 1: 5s first-screen gate (awe test) ----------
    focal = page.query_selector('.depth-panel[data-depth="surface"] .a-code-line')
    check("1a surface focal = single code line", focal is not None, focal.inner_text() if focal else "")
    supports = page.query_selector_all('.depth-panel[data-depth="surface"] .depth-support .support-slot')
    check("1b surface support <=2", len(supports) <= 2, f"support={len(supports)}")
    check("1c first-screen blocks <=3", (1 if focal else 0)+len(supports) <= 3, f"blocks={(1 if focal else 0)+len(supports)}")
    # only ONE focal-emphasis element competing on first panel
    emph = page.eval_on_selector_all('.depth-panel[data-depth="surface"] .emph-focal', "els=>els.length")
    check("1d single dominant emphasis (emph-focal<=1)", emph <= 1, f"emph-focal={emph}")
    page.evaluate("window.scrollTo(0,0)"); page.wait_for_timeout(300)
    page.screenshot(path=f"{SHOTS}/01_firstscreen.png")

    # ---------- CRIT 2: 4-depth narrative + verbatim facts ----------
    for d in ["surface","bytecode","interpreter","memory"]:
        check(f"2 depth panel [{d}]", page.query_selector(f'.depth-panel[data-depth="{d}"]') is not None)
    body_text = page.evaluate("document.body.textContent")
    for fact in ['print("Hello, Python!")',"PyCon Korea 2024","PyCon Korea 2025","defer: print(title)",
                 "_PyEval_EvalFrameDefault","Platinum 4 · 상위 2.5%","사이버메드","DICOM",
                 "RESUME","PUSH_NULL","LOAD_NAME","refcount","요즘IT"]:
        check(f"2 verbatim: {fact[:24]}", fact in body_text)

    # ---------- CRIT: scroll progress single 0..1 source + keyboard depth jump ----------
    prog = lambda: float(page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--scroll-progress')") or 0)
    page.evaluate("window.scrollTo(0,0)"); page.wait_for_timeout(250); p0 = prog()
    page.keyboard.press("4"); page.wait_for_timeout(1100)
    check("3a key '4' -> memory", page.evaluate("document.body.getAttribute('data-depth')")=="memory", page.evaluate("document.body.getAttribute('data-depth')"))
    p4 = prog()
    check("3b progress advanced to deep", p4 > p0+0.4, f"p0={p0:.3f} p4={p4:.3f}")
    check("3c progress in [0,1]", 0.0 <= p4 <= 1.0, f"p={p4:.3f}")
    page.keyboard.press("1"); page.wait_for_timeout(1000)
    check("3d key '1' -> surface", page.evaluate("document.body.getAttribute('data-depth')")=="surface")
    check("3e rail has 4 depth links", len(page.query_selector_all('#depth-rail a'))==4)
    check("3f rail marks current depth", page.query_selector('#depth-rail a[aria-current="true"]') is not None)
    # arrow-key deepening
    page.keyboard.press("ArrowDown"); page.wait_for_timeout(900)
    check("3g ArrowDown deepens", page.evaluate("document.body.getAttribute('data-depth')") in ("bytecode","interpreter","memory"), page.evaluate("document.body.getAttribute('data-depth')"))

    # ---------- CRIT 3: deepdive studio (existence-reason: persistence) ----------
    # reach coda CTA
    check("S-coda exists+visible", page.query_selector('#coda') is not None and not page.evaluate("document.getElementById('coda').hidden"))
    cta = page.query_selector('#coda-cta')
    cta.scroll_into_view_if_needed(); cta.click(); page.wait_for_timeout(1200)
    check("S-CTA autofocus intake textarea", page.evaluate("document.activeElement && document.activeElement.id")=="intake-answer", page.evaluate("document.activeElement && document.activeElement.id"))
    q1 = page.inner_text("#intake-question")
    ans = page.query_selector("#intake-answer")
    ans.click(); ans.fill("표면 아래 GIL 경합을 끝까지 파고드는 중입니다"); ans.press("Enter"); page.wait_for_timeout(700)
    n_after_answer = len(page.query_selector_all("#intake-cards .card-artifact"))
    check("S-Enter creates card", n_after_answer>=1, f"cards={n_after_answer}")
    check("S-question advanced", page.inner_text("#intake-question") != q1)
    # paste a code artifact (global paste path)
    page.evaluate("""()=>{const dt=new DataTransfer();dt.setData('text/plain','def solve():\\n    return sum(range(10**6))');
      document.body.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));}""")
    page.wait_for_timeout(700)
    n_after_paste = len(page.query_selector_all("#intake-cards .card-artifact"))
    check("S-paste adds artifact", n_after_paste>n_after_answer, f"cards={n_after_paste}")
    kinds = page.eval_on_selector_all("#intake-cards .card-artifact__kind","els=>els.map(e=>e.textContent)")
    check("S-code kind auto-detected", any("code" in (k or "") for k in kinds), str(kinds))
    page.screenshot(path=f"{SHOTS}/03_studio_cards.png")
    # server-side persistence
    api = page.evaluate("async()=>{const r=await fetch('/api/intake');return await r.json();}")
    n_server = len(api.get("entries",[]))
    check("S-persisted to SERVER", n_server>=2, f"server_entries={n_server}")
    # survive reload
    page.reload(wait_until="networkidle"); page.wait_for_timeout(1000)
    n_reload = len(page.query_selector_all("#intake-cards .card-artifact"))
    check("S-survive RELOAD", n_reload>=2, f"cards_after_reload={n_reload}")

    # ---------- CRIT 4: responsive 375px ----------
    m = ctx.new_page(); m.set_viewport_size({"width":375,"height":760})
    m.goto(BASE, wait_until="networkidle"); m.wait_for_timeout(700)
    dw = m.evaluate("document.documentElement.scrollWidth"); ww = m.evaluate("window.innerWidth")
    check("4a no horizontal overflow @375", dw <= ww+1, f"scrollW={dw} winW={ww}")
    hero = m.evaluate("()=>{const el=document.querySelector('.a-code-line');const r=el.getBoundingClientRect();return {w:Math.round(r.width),vw:window.innerWidth};}")
    check("4b hero code fits @375", hero["w"] <= hero["vw"], str(hero))
    m.screenshot(path=f"{SHOTS}/04_mobile375.png", full_page=False); m.close()

    # ---------- CRIT 4: reduced-motion ----------
    rm = br.new_context(viewport={"width":1280,"height":800}, reduced_motion="reduce")
    rp = rm.new_page(); rmerr=[]
    rp.on("console", lambda mm: rmerr.append(mm.text) if mm.type=="error" else None)
    rp.on("pageerror", lambda e: rmerr.append("PAGEERROR:"+str(e)))
    rp.goto(BASE, wait_until="networkidle"); rp.wait_for_timeout(700)
    rp.keyboard.press("4"); rp.wait_for_timeout(700)
    check("4c reduced-motion depth change works", rp.evaluate("document.body.getAttribute('data-depth')")=="memory", rp.evaluate("document.body.getAttribute('data-depth')"))
    check("4d aria-live announces depth", "깊이" in rp.inner_text("#depth-announcer"), rp.inner_text("#depth-announcer"))
    check("4e no console errors (reduced-motion)", len(rmerr)==0, str(rmerr[:3]))
    rp.screenshot(path=f"{SHOTS}/04_reducedmotion.png"); rm.close()

    check("G no console/page errors (main journey)", len(errors)==0, str(errors[:5]))
    br.close()

npass = sum(1 for _,ok,_ in R if ok)
print(f"\n=== {npass}/{len(R)} PASSED ===")
fails = [(n,e) for n,ok,e in R if not ok]
if fails:
    print("FAILURES:")
    for n,e in fails: print("  FAIL", n, "|", e)
json.dump({"pass":npass,"total":len(R),"fails":[[n,e] for n,e in fails]}, open("/tmp/qa_dd/result.json","w"), ensure_ascii=False)
sys.exit(0 if not fails else 1)
