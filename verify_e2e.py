import sys, os
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
os.makedirs("/tmp/dd/shots", exist_ok=True)
results = []
def check(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(("PASS" if cond else "FAIL"), name, "-", extra)

with sync_playwright() as p:
    br = p.chromium.launch(args=["--no-sandbox"])
    errors = []
    ctx = br.new_context(viewport={"width":1280,"height":800})
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(m.text) if m.type=="error" else None)
    page.on("pageerror", lambda e: errors.append("PAGEERROR: "+str(e)))
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(700)

    # CRITERION 1: first-screen gate
    focal = page.query_selector('.depth-panel[data-depth="surface"] .a-code-line')
    check("1a surface focal single code-line", focal is not None, (focal.inner_text() if focal else ""))
    supports = page.query_selector_all('.depth-panel[data-depth="surface"] .depth-support .support-slot')
    check("1b surface support <=2", len(supports) <= 2, f"support={len(supports)}")
    counted = (1 if focal else 0) + len(supports)
    check("1c counted blocks <=3", counted <= 3, f"blocks={counted}")
    page.screenshot(path="/tmp/dd/shots/01_firstscreen.png")

    # CRITERION 2: 4 depths + verbatim facts
    for d in ["surface","bytecode","interpreter","memory"]:
        check(f"2 depth {d} present", page.query_selector(f'.depth-panel[data-depth="{d}"]') is not None)
    body_text = page.evaluate("document.body.textContent")  # raw(verbatim), text-transform 미적용
    for fact in ['print("Hello, Python!")',"PyCon Korea 2024","PyCon Korea 2025",
                 "defer: print(title)","_PyEval_EvalFrameDefault","Platinum 4 · 상위 2.5%",
                 "사이버메드","RESUME","PUSH_NULL","refcount","요즘IT"]:
        check(f"2 fact: {fact[:22]}", fact in body_text)

    # CRITERION 3: keyboard nav + progress single value
    def progress():
        return page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--scroll-progress')")
    page.evaluate("window.scrollTo(0,0)"); page.wait_for_timeout(250)
    p0 = float(progress() or 0)
    page.keyboard.press("4"); page.wait_for_timeout(1000)
    depth_after = page.evaluate("document.body.getAttribute('data-depth')")
    p4 = float(progress() or 0)
    check("3a key '4' -> memory", depth_after=="memory", f"depth={depth_after}")
    check("3b progress advanced", p4 > p0+0.4, f"p0={p0} p4={p4}")
    check("3c progress in [0,1]", 0.0 <= p4 <= 1.0, f"p={p4}")
    page.keyboard.press("1"); page.wait_for_timeout(900)
    check("3d key '1' -> surface", page.evaluate("document.body.getAttribute('data-depth')")=="surface")
    check("3e rail 4 links", len(page.query_selector_all('#depth-rail a'))==4)
    check("3f rail aria-current", page.query_selector('#depth-rail a[aria-current=\"true\"]') is not None)

    # CRITERION 4: coda + CTA -> intake
    check("4a coda visible", page.query_selector('#coda') is not None and not page.evaluate("document.getElementById('coda').hidden"))
    cta = page.query_selector('#coda-cta')
    check("4b coda CTA", cta is not None, cta.inner_text() if cta else "")
    cta.scroll_into_view_if_needed(); cta.click(); page.wait_for_timeout(1100)
    check("4c CTA focuses intake", page.evaluate("document.activeElement && document.activeElement.id")=="intake-answer")

    # CRITERION 5: intake flow
    q = page.inner_text("#intake-question")
    check("5a first question", "가장 깊게 파고들고" in q, q)
    ans = page.query_selector("#intake-answer")
    ans.click(); ans.fill("표면 아래 GIL 경합을 파고드는 중"); ans.press("Enter")
    page.wait_for_timeout(600)
    cards = page.query_selector_all("#intake-cards .card-artifact")
    check("5b Enter adds card", len(cards)>=1, f"cards={len(cards)}")
    check("5c count reflects", "개" in page.inner_text("#intake-count"))
    check("5d question advanced", page.inner_text("#intake-question") != q)
    page.evaluate("""() => { const dt=new DataTransfer(); dt.setData('text/plain','def gil(): pass');
      document.body.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); }""")
    page.wait_for_timeout(500)
    cards2 = page.query_selector_all("#intake-cards .card-artifact")
    check("5e paste adds artifact", len(cards2)>len(cards), f"cards={len(cards2)}")
    kinds = page.eval_on_selector_all("#intake-cards .card-artifact__kind","els=>els.map(e=>e.textContent)")
    check("5f code kind detected", "code" in kinds, str(kinds))
    page.screenshot(path="/tmp/dd/shots/05_intake.png")
    api = page.evaluate("async()=>{const r=await fetch('/api/intake');return await r.json();}")
    check("5g persisted to server", len(api.get("entries",[]))>=2, f"server={len(api.get('entries',[]))}")
    page.reload(wait_until="networkidle"); page.wait_for_timeout(800)
    check("5h survive reload", len(page.query_selector_all("#intake-cards .card-artifact"))>=2)

    # CRITERION 6: responsive + reduced-motion
    m = ctx.new_page(); m.set_viewport_size({"width":375,"height":720})
    m.goto(BASE, wait_until="networkidle"); m.wait_for_timeout(600)
    doc_w = m.evaluate("document.documentElement.scrollWidth"); win_w = m.evaluate("window.innerWidth")
    check("6a no h-overflow @375", doc_w <= win_w+1, f"scrollW={doc_w} winW={win_w}")
    fit = m.evaluate("()=>{const el=document.querySelector('.a-code-line');const r=el.getBoundingClientRect();return {w:Math.round(r.width),vw:window.innerWidth};}")
    check("6b hero fits @375", fit["w"] <= fit["vw"], str(fit))
    m.screenshot(path="/tmp/dd/shots/06_mobile.png"); m.close()

    rm = br.new_context(viewport={"width":1280,"height":800}, reduced_motion="reduce")
    rp = rm.new_page(); rmerr=[]
    rp.on("console", lambda mm: rmerr.append(mm.text) if mm.type=="error" else None)
    rp.goto(BASE, wait_until="networkidle"); rp.wait_for_timeout(500)
    rp.keyboard.press("4"); rp.wait_for_timeout(500)
    check("6c reduced-motion depth change", rp.evaluate("document.body.getAttribute('data-depth')")=="memory")
    check("6d aria-live announces", "깊이" in rp.inner_text("#depth-announcer"), rp.inner_text("#depth-announcer"))
    check("6e no console errors (rm)", len(rmerr)==0, str(rmerr[:3]))
    rm.close()

    check("GLOBAL no console errors", len(errors)==0, str(errors[:4]))
    br.close()

npass = sum(1 for _,ok,_ in results if ok)
print(f"\n=== {npass}/{len(results)} PASSED ===")
fails = [(n,e) for n,ok,e in results if not ok]
if fails:
    print("FAILURES:")
    for n,e in fails: print("  -",n,e)
    sys.exit(1)
