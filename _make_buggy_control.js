// 대조군: 수정 전(버그) IO 로직으로 되돌린 app.js 사본을 만든다(수정이 실제로 회귀를 잡는지 검증용).
const fs = require("fs");
const src = fs.readFileSync(process.argv[2], "utf8");

const fixedBlock = `  /* ── 스크롤 진행도 0..1 방출 + 현재 깊이 판정 ─────────────────────────── */
  function setupProgress(depthsRoot, announcer, rail) {
    let ticking = false;
    let lastDepth = null;

    // 깊이 판정의 단일 소스 = progress(emit 아래). body[data-depth]/rail/announcer는
    // 전부 이 값만 반영한다 — 별도 IO 최대가시패널 계산을 두면 depths-root를 완주해
    // 모든 패널의 가시영역이 0이 되는 순간(코다/인테이크 진입) 배열 첫 패널(surface)로
    // 디폴트되어 진행도(1.0)와 표시가 모순되는 회귀가 생긴다 — QA가 실제로 잡은 버그.
    function setDepth(depth) {
      document.body.setAttribute("data-depth", depth);
      if (depth === lastDepth) return;
      lastDepth = depth;
      announcer.textContent = \`깊이: \${DEPTH_LABEL[depth] || depth}\`;
      $$("#depth-rail a").forEach((a) => a.removeAttribute("aria-current"));
      const active = $(\`#depth-rail a[href="#depth-\${depth}"]\`);
      if (active) active.setAttribute("aria-current", "true");
    }

    function emit() {
      ticking = false;
      const range = depthsRoot.offsetHeight - window.innerHeight;
      const y = window.scrollY - depthsRoot.offsetTop;
      const progress = range > 0 ? clamp01(y / range) : 0;
      document.documentElement.style.setProperty("--scroll-progress", progress.toFixed(4));
      // 밴드 기반 깊이(모션이 이 event를 단일 소스로 소비) — progress는 depths-root를
      // 지난 뒤(코다/인테이크)에도 1로 클램프되므로 depth는 마지막 깊이(memory)에 머문다.
      const idx = Math.min(DEPTH_ORDER.length - 1, Math.floor(progress / 0.25 + 1e-6));
      const depth = progress >= 1 ? "memory" : DEPTH_ORDER[idx];
      document.dispatchEvent(new CustomEvent("deepdive:progress", { detail: { progress, depth } }));
      setDepth(depth);
    }
    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(emit); }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", () => { onScroll(); fitAll(); }, { passive: true });

    // reveal 트리거 전용(깊이 판정과는 분리 — 진행도가 단일 소스)
    const panels = $$(".depth-panel", depthsRoot);
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) e.target.querySelectorAll(".reveal").forEach((r) => r.classList.add("is-in"));
      });
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    panels.forEach((p) => io.observe(p));`;

const buggyBlock = `  /* ── 스크롤 진행도 0..1 방출 + 현재 깊이 판정 ─────────────────────────── */
  function setupProgress(depthsRoot, announcer, rail) {
    let ticking = false;
    let lastDepth = null;

    function emit() {
      ticking = false;
      const range = depthsRoot.offsetHeight - window.innerHeight;
      const y = window.scrollY - depthsRoot.offsetTop;
      const progress = range > 0 ? clamp01(y / range) : 0;
      document.documentElement.style.setProperty("--scroll-progress", progress.toFixed(4));
      // 밴드 기반 깊이(모션이 이 event를 단일 소스로 소비)
      const idx = Math.min(DEPTH_ORDER.length - 1, Math.floor(progress / 0.25 + 1e-6));
      const depth = progress >= 1 ? "memory" : DEPTH_ORDER[idx];
      document.dispatchEvent(new CustomEvent("deepdive:progress", { detail: { progress, depth } }));
    }
    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(emit); }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", () => { onScroll(); fitAll(); }, { passive: true });

    // 현재 깊이 = 가장 많이 보이는 패널(IO) → 레일/aria-live/reveal
    const panels = $$(".depth-panel", depthsRoot);
    const io = new IntersectionObserver((entries) => {
      let best = null;
      entries.forEach((e) => {
        if (e.isIntersecting && e.target.querySelectorAll(".reveal").forEach) {
          e.target.querySelectorAll(".reveal").forEach((r) => r.classList.add("is-in"));
        }
      });
      // 가장 큰 교차비 패널
      panels.forEach((p) => {
        const r = p.getBoundingClientRect();
        const vh = window.innerHeight;
        const visible = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
        if (!best || visible > best.v) best = { el: p, v: visible };
      });
      if (best) {
        const depth = best.el.getAttribute("data-depth");
        document.body.setAttribute("data-depth", depth);
        if (depth !== lastDepth) {
          lastDepth = depth;
          announcer.textContent = \`깊이: \${DEPTH_LABEL[depth] || depth}\`;
          $$("#depth-rail a").forEach((a) => a.removeAttribute("aria-current"));
          const active = $(\`#depth-rail a[href="#depth-\${depth}"]\`);
          if (active) active.setAttribute("aria-current", "true");
        }
      }
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    panels.forEach((p) => io.observe(p));`;

if (!src.includes(fixedBlock)) {
  console.error("MARKER_NOT_FOUND — fixed block not found verbatim in source");
  process.exit(1);
}
// replace()의 2번째 인자가 문자열이면 $$ 등 특수 치환패턴으로 해석되어 buggyBlock 안의
// "$$("가 "$("로 깨진다 — 함수 리플레이서로 그 해석을 우회해 리터럴 그대로 삽입한다.
const out = src.replace(fixedBlock, () => buggyBlock);
fs.writeFileSync(process.argv[3], out, "utf8");
console.log("OK wrote buggy control to", process.argv[3]);
