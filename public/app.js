/* ============================================================================
   DEEP DIVE PORTFOLIO — 통합 엔트리 런타임 (owner: 프론트엔드)
   - content.json(렌더 계약)을 소비해 4깊이 + 코다 + 인테이크를 렌더
   - 스크롤 진행도 0..1 단일 소스 방출(모션 소비) + 원탭/키보드 깊이 점프
   - 딥다이브 인테이크: autofocus·Enter·붙여넣기/드롭 → 유물 카드 낙관적 적재
   - 영속: localStorage(즉시·오프라인) + /api/intake(백엔드 ③ 소유) 그레이스풀 동기
   토큰/유물 클래스는 tokens.css·artifacts.css만 소비(하드코딩 색 0).
   ============================================================================ */
(function () {
  "use strict";

  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");
  const STORAGE_KEY = "deepdive:intake:v1";
  const API_BASE = "/api/intake"; // 백엔드 ③ 계약 — 아래 [API 계약] 참고

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const uid = () =>
    "e_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);

  const DEPTH_ORDER = ["surface", "bytecode", "interpreter", "memory"];
  const DEPTH_LABEL = { surface: "표면", bytecode: "바이트코드", interpreter: "인터프리터", memory: "메모리", unassigned: "미분류" };
  const DEPTH_MICRO = { surface: "00 · SURFACE", bytecode: "01 · BYTECODE", interpreter: "02 · INTERPRETER", memory: "03 · MEMORY" };
  const TAGLINE_SLOT = {
    surface: "우리가 매일 쓰는 한 줄",
    bytecode: "표면 아래 — 컴파일된 명령들",
    interpreter: "실행을 돌리는 루프 — 그리고 그가 바꾼 것",
    memory: "가장 깊은 곳 — 객체와 참조가 사는 자리",
  };

  /* ── Python 신택스 하이라이트(신뢰된 content.json 코드용) ───────────────── */
  const PY_KW = new Set(["def","class","return","import","from","as","if","else","elif","for","while","in","not","and","or","None","True","False","lambda","with","yield","pass","break","continue","try","except","finally","raise","global","nonlocal","del","assert","async","await"]);
  function highlightPython(code) {
    const re = /(#.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|(\s+)|([^\s\w])/gm;
    let out = "", m;
    while ((m = re.exec(code))) {
      if (m[1]) out += `<span class="tok-com">${esc(m[1])}</span>`;
      else if (m[2]) out += `<span class="tok-str">${esc(m[2])}</span>`;
      else if (m[3]) out += `<span class="tok-num">${esc(m[3])}</span>`;
      else if (m[4]) {
        const word = m[4];
        const after = code.slice(re.lastIndex).match(/^\s*\(/);
        if (PY_KW.has(word)) out += `<span class="tok-kw">${esc(word)}</span>`;
        else if (after) out += `<span class="tok-func">${esc(word)}</span>`;
        else out += `<span class="tok-plain">${esc(word)}</span>`;
      } else if (m[5]) out += esc(m[5]);
      else out += `<span class="tok-punc">${esc(m[6])}</span>`;
    }
    return out;
  }

  /* ── 유물 렌더러(depth-schema artifactTypes → 마크업) ─────────────────── */
  function renderFocal(a) {
    switch (a.type) {
      case "code-line": {
        const ann = a.annotation
          ? `<p class="artifact__caption" style="margin-top:var(--sp-4)">${esc(a.annotation)}</p>` : "";
        return `<div class="emph-focal"><div class="a-code-line" data-fit="1">${highlightPython(a.code)}<span class="cursor" aria-hidden="true"></span></div>${ann}</div>`;
      }
      case "bytecode-dump": {
        const rows = (a.instructions || []).map((ins) => {
          const focus = String(ins.opname).toUpperCase() === "CALL" ? " is-focus" : "";
          return `<div class="ins${focus}"><span class="off">${esc(ins.offset)}</span><span class="op">${esc(ins.opname)}</span><span class="arg">${esc(ins.arg != null ? ins.arg : "")}</span></div>`;
        }).join("");
        const cap = a.caption ? `<p class="artifact__caption">${esc(a.caption)}</p>` : "";
        return `<div class="emph-focal"><div class="artifact a-bytecode" data-fit-rows="1"><div class="artifact__chrome">${esc(a.source || "dis(...)")}</div><div class="artifact__body">${rows}</div></div>${cap}</div>`;
      }
      case "call-stack": {
        const frames = (a.frames || []).map((f, i) => {
          const cur = i === a.highlightIndex ? " is-current" : "";
          const curTag = i === a.highlightIndex ? ` <span style="color:var(--accent)">현재</span>` : "";
          return `<div class="frame${cur}"><span class="fn">${esc(f.func)}</span> · ${esc(f.module)}${curTag}</div>`;
        }).join("");
        const cap = a.caption ? `<p class="artifact__caption">${esc(a.caption)}</p>` : "";
        return `<div class="emph-focal"><div class="a-callstack">${frames}</div>${cap}</div>`;
      }
      case "memory-cell": {
        const rc = a.refcount != null ? `<span class="refcount">refcount ${esc(a.refcount)}</span>` : "";
        const obt = a.type_field ? `<div class="label" style="margin-top:var(--sp-2)">ob_type: <span class="value">${esc(a.type_field)}</span></div>` : "";
        const cap = a.caption ? `<p class="artifact__caption">${esc(a.caption)}</p>` : "";
        return `<div class="emph-focal"><div class="a-memgrid"><div class="a-memcell"><div class="label">${esc(a.label)}</div><div class="value">${esc(a.value)}</div>${obt}${rc}</div></div>${cap}</div>`;
      }
      default:
        return `<div class="emph-focal"><pre class="a-prose">${esc(JSON.stringify(a))}</pre></div>`;
    }
  }

  function renderSupport(a) {
    switch (a.type) {
      case "spec-badge":
        return `<span class="a-badge">${esc(a.label)}${a.value ? ` · ${esc(a.value)}` : ""}</span>`;
      case "prose":
        return `<p class="a-prose">${a.heading ? `<strong>${esc(a.heading)}</strong><br>` : ""}${esc(a.body)}</p>`;
      case "slide": {
        const inner = `<div class="a-slide"><span class="event">${esc(a.event)}</span><span class="title">${esc(a.title)}</span><span class="role">${esc(a.role)}</span></div>`;
        return a.url
          ? `<a href="${esc(a.url)}" target="_blank" rel="noopener" aria-label="${esc(a.event)} ${esc(a.title)} (새 창)" style="text-decoration:none;display:block">${inner}</a>`
          : inner;
      }
      case "link-out":
        return `<a class="a-link" href="${esc(a.href)}" target="_blank" rel="noopener">${esc(a.label)}</a>`;
      case "trace":
        return `<div class="a-trace"><span class="label">${esc(a.label)}</span><span class="value">${esc(a.value)}</span>${a.detail ? `<span class="detail">${esc(a.detail)}</span>` : ""}</div>`;
      case "commit":
        return `<div class="a-commit"><span class="dot">●─</span><span class="hash">${esc(a.hash)}</span><span class="subject">${esc(a.subject)}</span>${a.repo ? `<span class="repo">${esc(a.repo)}</span>` : ""}</div>`;
      default:
        return `<p class="a-prose">${esc(a.body || "")}</p>`;
    }
  }

  /* ── 깊이 패널 렌더 ────────────────────────────────────────────────────── */
  function renderDepths(depths, root) {
    root.innerHTML = depths.map((d, di) => {
      const support = (d.support || []).slice(0, 2).map((s, si) =>
        `<div class="support-slot emph-support reveal" style="--reveal-delay:${(si + 1) * 90}ms">${renderSupport(s)}</div>`
      ).join("");
      return `
      <section class="depth-panel" data-depth="${esc(d.id)}" id="depth-${esc(d.id)}"
               aria-labelledby="dl-${esc(d.id)}" tabindex="-1">
        <div class="depth-stage">
          <span class="depth-microlabel reveal" id="dl-${esc(d.id)}">${esc(DEPTH_MICRO[d.id] || d.id)}</span>
          <div class="depth-focal reveal" style="--reveal-delay:60ms">${renderFocal(d.focal)}</div>
          <p class="depth-tagline reveal" style="--reveal-delay:120ms">${esc(d.tagline || TAGLINE_SLOT[d.id] || "")}</p>
          <div class="depth-support">${support}</div>
        </div>
      </section>`;
    }).join("");
  }

  /* ── 우측 깊이 레일 ────────────────────────────────────────────────────── */
  function renderRail(depths) {
    const ul = $("#depth-rail ul");
    ul.innerHTML = depths.map((d, i) =>
      `<li><a href="#depth-${esc(d.id)}" data-idx="${i}" aria-label="${esc(DEPTH_LABEL[d.id])} 깊이로 이동">
         <span class="tick" aria-hidden="true"></span><span class="name">${esc(DEPTH_LABEL[d.id])}</span></a></li>`
    ).join("");
  }

  /* ── fit-to-width: 대형 모노가 카드/뷰포트를 넘지 않게(경험 기반) ───────── */
  function availWidth(el) {
    // 부모가 content로 부풀 수 있으므로(justify-items:start) 무대 콘텐츠폭을 기준으로 잰다.
    const stage = el.closest(".depth-stage");
    let w;
    if (stage) {
      const cs = getComputedStyle(stage);
      w = stage.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
    } else {
      w = (el.parentElement ? el.parentElement.clientWidth : 0);
    }
    return Math.min(w || Infinity, document.documentElement.clientWidth);
  }
  function fitText(el, minPx) {
    if (!el) return;
    el.style.fontSize = "";
    const avail = availWidth(el);
    if (!isFinite(avail) || avail <= 0) return;
    let guard = 40;
    while (el.scrollWidth > avail && guard-- > 0) {
      const cur = parseFloat(getComputedStyle(el).fontSize);
      const next = cur * 0.94;
      if (next < minPx) { el.style.fontSize = minPx + "px"; break; }
      el.style.fontSize = next + "px";
    }
  }
  function fitAll() {
    $$('.a-code-line[data-fit]').forEach((el) => fitText(el, 20));
    // bytecode rows: 넘치면 카드 폰트 축소
    $$('.a-bytecode[data-fit-rows] .artifact__body').forEach((body) => {
      body.style.fontSize = "";
      let guard = 20;
      while (body.scrollWidth > body.clientWidth && guard-- > 0) {
        const cur = parseFloat(getComputedStyle(body).fontSize);
        const next = cur * 0.94;
        if (next < 11) { body.style.fontSize = "11px"; break; }
        body.style.fontSize = next + "px";
      }
    });
  }

  /* ── 스크롤 진행도 0..1 방출 + 현재 깊이 판정 ─────────────────────────── */
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
      announcer.textContent = `깊이: ${DEPTH_LABEL[depth] || depth}`;
      $$("#depth-rail a").forEach((a) => a.removeAttribute("aria-current"));
      const active = $(`#depth-rail a[href="#depth-${depth}"]`);
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
    panels.forEach((p) => io.observe(p));

    // 코다도 reveal
    const coda = $("#coda");
    if (coda) new IntersectionObserver((es, ob) => {
      es.forEach((e) => { if (e.isIntersecting) { e.target.querySelectorAll(".reveal").forEach((r) => r.classList.add("is-in")); } });
    }, { threshold: 0.3 }).observe(coda);

    emit();
  }

  /* ── 키보드/원탭 깊이 점프 ────────────────────────────────────────────── */
  function isInteractive(t) {
    if (!t) return false;
    const tag = (t.tagName || "").toLowerCase();
    return tag === "textarea" || tag === "input" || tag === "select" || t.isContentEditable === true;
  }
  function setupKeyboard(depthsRoot) {
    const stops = [
      ...$$(".depth-panel", depthsRoot),
      $("#coda"),
      $("#intake"),
    ].filter(Boolean);

    function goto(i) {
      const t = stops[Math.max(0, Math.min(stops.length - 1, i))];
      if (!t) return;
      // 예약된 인테이크 지연 포커스가 있으면 취소 — 없으면 이 명시적 이동 뒤에도
      // 나중에 발동해 포커스를 인테이크로 강제로 되돌리는 회귀가 생긴다.
      cancelIntakeFocus();
      t.scrollIntoView({ behavior: REDUCED.matches ? "auto" : "smooth", block: "start" });
      if (t.hasAttribute("tabindex")) {
        try { t.focus({ preventScroll: true }); } catch (_) { t.focus(); }
      }
    }
    function current() {
      let idx = 0, min = Infinity;
      stops.forEach((s, i) => {
        const d = Math.abs(s.getBoundingClientRect().top);
        if (d < min) { min = d; idx = i; }
      });
      return idx;
    }

    document.addEventListener("keydown", (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape" && isInteractive(e.target)) {
        // 명시적·발견가능한 탈출: autofocus로 갇힌 포커스를 즉시 풀어
        // depth 키보드 내비게이션 제어권을 되돌린다
        e.preventDefault();
        try { e.target.blur(); } catch (_) {}
        return;
      }
      const inField = isInteractive(e.target);
      const k = e.key;
      // 포커스가 인테이크(또는 다른 interactive 요소) 안에 있으면 — 발생 경위(클릭/
      // Tab/autofocus)·내용 유무 불문 — j/k/숫자/화살표는 전부 타이핑으로만 흐른다.
      // depth-jump는 포커스가 필드 밖에 있을 때만 동작한다. autofocus로 빈 칸에
      // 갇힌 경우의 탈출구는 위 Escape→blur뿐(판별축이 아니라 별도 명시적 메커니즘).
      if (inField) return;
      if (k === "ArrowDown" || k === "j" || k === "PageDown") { e.preventDefault(); goto(current() + 1); }
      else if (k === "ArrowUp" || k === "k" || k === "PageUp") { e.preventDefault(); goto(current() - 1); }
      else if (k === "Home") { e.preventDefault(); goto(0); }
      else if (k === "End") { e.preventDefault(); goto(stops.length - 1); }
      else if (k >= "1" && k <= "4") { e.preventDefault(); goto(parseInt(k, 10) - 1); }
    });

    // 레일 클릭 → 부드러운 점프(기본 앵커도 되지만 reduced-motion 일관성 위해)
    $("#depth-rail").addEventListener("click", (e) => {
      const a = e.target.closest("a[href^='#depth-']");
      if (!a) return;
      e.preventDefault();
      const idx = parseInt(a.getAttribute("data-idx"), 10) || 0;
      goto(idx);
    });
  }

  /* ── 코다 ──────────────────────────────────────────────────────────────── */
  function renderCoda(coda) {
    const sec = $("#coda");
    if (!coda) { sec.remove(); return; }
    const h = $("#coda-headline");
    // 두 번째 문장(질문)에 액센트
    const parts = String(coda.headline).split("\n");
    h.innerHTML = parts.map((p, i) => i === parts.length - 1 ? `<span class="em">${esc(p)}</span>` : esc(p)).join("\n");
    const cta = $("#coda-cta");
    cta.textContent = coda.cta.label;
    cta.addEventListener("click", () => {
      const target = document.getElementById(coda.cta.target) || $("#intake");
      target.scrollIntoView({ behavior: REDUCED.matches ? "auto" : "smooth", block: "start" });
      focusIntake();
    });
    sec.hidden = false;
  }

  /* ── 인테이크(딥다이브 환경) ─────────────────────────────────────────── */
  let intakeState = { questions: [], qIndex: 0, done: false, entries: [] };
  // focusIntake()의 지연 setTimeout 핸들 — 미저장 시 blur/다른 곳으로의 이동 이후에도
  // 타이머가 나중에 무조건 발동해 포커스를 강제로 되돌리는 회귀가 생긴다(PM 실측).
  let intakeFocusTimer = null;

  function cancelIntakeFocus() {
    if (intakeFocusTimer) { clearTimeout(intakeFocusTimer); intakeFocusTimer = null; }
  }

  function focusIntake() {
    const ans = $("#intake-answer");
    if (!ans) return;
    cancelIntakeFocus();
    intakeFocusTimer = setTimeout(() => {
      intakeFocusTimer = null;
      try { ans.focus({ preventScroll: true }); } catch (_) { ans.focus(); }
    }, REDUCED.matches ? 0 : 420);
  }

  function renderProgressDots() {
    const wrap = $("#intake-progress");
    wrap.innerHTML = intakeState.questions.map((q, i) => {
      const cur = i === intakeState.qIndex && !intakeState.done ? ' aria-current="true"' : "";
      const done = i < intakeState.qIndex || intakeState.done ? " done" : "";
      return `<span class="dot${done}" role="listitem"${cur} title="${esc(q.prompt)}"></span>`;
    }).join("");
  }

  function showQuestion() {
    const qEl = $("#intake-question");
    const ans = $("#intake-answer");
    if (intakeState.done) {
      qEl.textContent = "모든 질문을 지나왔습니다 — 무엇이든 더 던지세요.";
      ans.placeholder = "자유롭게 이어가세요… (Enter로 담기)";
      renderProgressDots();
      return;
    }
    const q = intakeState.questions[intakeState.qIndex];
    const apply = () => {
      qEl.textContent = q.prompt;
      ans.placeholder = q.placeholder || "";
      ans.value = "";
      qEl.classList.remove("fading");
    };
    if (REDUCED.matches) apply();
    else {
      qEl.classList.add("fading");
      setTimeout(apply, 180);
    }
    renderProgressDots();
  }

  function advanceQuestion() {
    if (intakeState.qIndex < intakeState.questions.length - 1) {
      intakeState.qIndex += 1;
    } else {
      intakeState.done = true;
    }
    showQuestion();
  }

  function submitAnswer() {
    const ans = $("#intake-answer");
    const text = ans.value.trim();
    if (!text) { ans.focus(); return; }
    const q = intakeState.done ? null : intakeState.questions[intakeState.qIndex];
    addEntry({
      type: "answer",
      kind: "text",
      depth: q ? q.depthHint : "unassigned",
      qid: q ? q.id : null,
      prompt: q ? q.prompt : "자유 서술",
      content: text,
    });
    ans.value = "";
    advanceQuestion();
    ans.focus();
  }

  /* ── 유물 카드 적재(낙관적) ───────────────────────────────────────────── */
  function detectKind(text) {
    const t = text.trim();
    if (/^https?:\/\/\S+$/.test(t)) return "link";
    if (/(^|\n)\s*(def |class |import |from .+ import|#include|function |const |let |var |=>|;|\{|\}|<\/?\w+>)/.test(t) ||
        /\b(print|return|for|while|if)\s*[\(:]/.test(t)) return "code";
    return "text";
  }

  function addEntry(partial) {
    const entry = Object.assign(
      { id: uid(), createdAt: Date.now(), status: "pending" },
      partial
    );
    intakeState.entries.unshift(entry);
    renderCards();
    save();
    syncPost(entry);
    return entry;
  }

  function throwArtifact(text, meta) {
    const t = String(text || "").trim();
    if (!t) return;
    addEntry({
      type: "artifact",
      kind: detectKind(t),
      depth: "unassigned",
      content: t,
      source: (meta && meta.source) || "drop",
    });
  }

  function cardBody(entry) {
    const p = document.createElement(entry.kind === "text" || entry.type === "answer" ? "p" : "pre");
    p.className = "card-artifact__body" + (entry.kind === "text" || entry.type === "answer" ? " is-prose" : "");
    if (entry.kind === "link") {
      const a = document.createElement("a");
      a.href = entry.content; a.target = "_blank"; a.rel = "noopener";
      a.textContent = entry.content;
      p.appendChild(a);
    } else {
      p.textContent = entry.content; // 사용자 입력 → textContent(XSS 방어)
    }
    return p;
  }

  function renderCards() {
    const ul = $("#intake-cards");
    const empty = $("#intake-empty");
    const count = $("#intake-count");
    ul.innerHTML = "";
    intakeState.entries.forEach((entry) => {
      const li = document.createElement("li");
      li.className = "card-artifact" + (entry.status === "pending" ? " is-pending" : "") + (entry.status === "error" ? " is-error" : "");
      li.dataset.id = entry.id;

      const meta = document.createElement("div");
      meta.className = "card-artifact__meta";
      const kind = document.createElement("span");
      kind.className = "card-artifact__kind";
      kind.textContent = entry.type === "answer" ? "answer" : entry.kind;
      const depth = document.createElement("span");
      depth.className = "card-artifact__depth";
      depth.textContent = DEPTH_LABEL[entry.depth] || entry.depth || "미분류";
      meta.appendChild(kind); meta.appendChild(depth);
      if (entry.prompt) {
        const pr = document.createElement("span");
        pr.textContent = entry.prompt;
        pr.style.textTransform = "none";
        pr.style.color = "var(--text-tertiary)";
        meta.appendChild(pr);
      }

      const del = document.createElement("button");
      del.className = "card-artifact__del";
      del.setAttribute("aria-label", "이 유물 카드 삭제");
      del.textContent = "✕";
      del.addEventListener("click", () => removeEntry(entry.id));

      const status = document.createElement("div");
      status.className = "card-artifact__status";
      status.textContent = entry.status === "saved" ? "저장됨" : entry.status === "error" ? "로컬 저장됨 (서버 대기)" : "담는 중…";

      li.appendChild(del);
      li.appendChild(meta);
      li.appendChild(cardBody(entry));
      li.appendChild(status);
      ul.appendChild(li);
    });
    const n = intakeState.entries.length;
    count.textContent = n + "개";
    empty.hidden = n > 0;
  }

  function removeEntry(id) {
    intakeState.entries = intakeState.entries.filter((e) => e.id !== id);
    renderCards();
    save();
    syncDelete(id);
  }

  /* ── 영속: localStorage(즉시) + /api/intake(그레이스풀) ─────────────────
     [API 계약 — 백엔드 ③에게 공유]
       GET    /api/intake        → { entries: Entry[] }        (조회, 없으면 [])
       POST   /api/intake        body: Entry → { entry: Entry }  (원문 유실 없이 적재)
       DELETE /api/intake/:id    → { ok: true }
     Entry = { id, type:'answer'|'artifact', kind, depth('surface'|..|'memory'|'unassigned'),
               content, qid?, prompt?, source?, createdAt }
     서버 미가동/실패 시 클라이언트는 localStorage만으로 완전 동작(재방문 유지). ──────── */
  function save() {
    try {
      const slim = intakeState.entries.map(({ status, ...rest }) => rest);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
    } catch (_) {}
  }
  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.map((e) => Object.assign({ status: "saved" }, e)) : [];
    } catch (_) { return []; }
  }
  async function syncGet() {
    try {
      const res = await fetch(API_BASE, { headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data && data.entries) ? data.entries : null;
    } catch (_) { return null; }
  }
  async function syncPost(entry) {
    try {
      const { status, ...body } = entry;
      const res = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const ok = res.ok;
      const target = intakeState.entries.find((e) => e.id === entry.id);
      if (target) { target.status = ok ? "saved" : "error"; renderCards(); if (ok) save(); }
    } catch (_) {
      const target = intakeState.entries.find((e) => e.id === entry.id);
      if (target) { target.status = "error"; renderCards(); } // 로컬엔 이미 저장됨
    }
  }
  async function syncDelete(id) {
    try { await fetch(`${API_BASE}/${encodeURIComponent(id)}`, { method: "DELETE" }); } catch (_) {}
  }

  /* ── 인테이크 이벤트 배선 ─────────────────────────────────────────────── */
  function setupIntake(intake) {
    intakeState.questions = intake.questions || [];
    $("#intake-opening").textContent = intake.opening || "";
    $("#dz-prompt").textContent = "⤓ " + (intake.dropzone.prompt || "");
    $("#dz-hint").textContent = intake.dropzone.hint || "";
    $("#dz-accepted").textContent = intake.dropzone.acceptedHint || "";

    // 로컬 우선 렌더 → 서버 있으면 병합(권위)
    intakeState.entries = loadLocal();
    renderCards();
    syncGet().then((server) => {
      if (!server) return;
      const byId = new Map();
      server.forEach((e) => byId.set(e.id, Object.assign({ status: "saved" }, e)));
      intakeState.entries.forEach((e) => { if (!byId.has(e.id)) byId.set(e.id, e); });
      intakeState.entries = Array.from(byId.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      renderCards(); save();
    });

    showQuestion();

    const ans = $("#intake-answer");
    // IO의 "최초 자동포커스" 발화를 영구 무력화하는 플래그. 클릭→Escape처럼 사용자가
    // 명시적으로 필드를 벗어나면(blur) true로 굳는다 — IO 콜백은 비동기(레이아웃 이후)라
    // 클릭이 유발한 auto-scroll이 그 IO를 "최초로" 임계값 넘기며 늦게 트리거할 수 있는데,
    // 이 늦은 첫 발화가 blur 이후 도착해도 이 플래그로 focusIntake()를 걸러 강제 재포커스를
    // 막는다(코다 CTA·#intake 해시 등 "명시적" focusIntake() 호출은 이 플래그와 무관 —
    // 무력화 대상은 IO의 수동적 자동발화뿐).
    let intakeAutoDismissed = false;
    ans.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); submitAnswer(); }
    });
    // Escape(→blur) 등 어떤 경로로든 필드를 벗어나면 예약된 지연 포커스도 함께 무효화하고,
    // 이후 IO의 최초발화도 영구 차단 — 안 그러면 "일시적으로만" blur되고 타이머(또는 늦게
    // 도착한 IO 최초발화)가 나중에 포커스를 되돌린다(PM 실측 회귀 + 그 트리거경위 변주).
    ans.addEventListener("blur", () => { cancelIntakeFocus(); intakeAutoDismissed = true; });
    $("#intake-submit").addEventListener("click", submitAnswer);
    $("#intake-skip").addEventListener("click", () => { advanceQuestion(); ans.focus(); });

    // 인테이크가 처음 화면에 들어오면 커서 자동(autofocus) — 상단 진입은 방해 안 함
    // threshold: #intake 섹션 실측높이(~1410px)가 커서 0.55는 1280x720(최대 가시비율
    // 0.5106)·1366x768(0.5446) 등 흔한 데스크톱에서 수학적으로 절대 못 넘어 "스크롤완주
    // autofocus" 경로가 영구 미발화했다(QA 실측, T-112204-1 REPORTS.md). 0.45로 낮춰
    // 두 해상도 모두 실측 최대비율을 넘도록 함(섹션 높이/레이아웃은 디자인 소유라 안 건드림).
    let focused = false;
    new IntersectionObserver((es, ob) => {
      es.forEach((e) => {
        if (!e.isIntersecting || focused) return;
        // "최초 교차"는 발화 즉시 소진(disconnect) — dismissed 상태라도 다시 관찰할 필요
        // 없음(그 뒤 어떤 교차에도 자동포커스는 영구히 재발화하지 않아야 하므로).
        focused = true;
        ob.disconnect();
        if (!intakeAutoDismissed && intake.autofocusFirst) focusIntake();
      });
    }, { threshold: 0.45 }).observe($("#intake"));

    // 드롭존
    const dz = $("#dropzone");
    ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("is-drag"); }));
    ["dragleave", "dragend"].forEach((ev) => dz.addEventListener(ev, (e) => { if (e.target === dz) dz.classList.remove("is-drag"); }));
    dz.addEventListener("drop", (e) => {
      e.preventDefault(); dz.classList.remove("is-drag");
      const dt = e.dataTransfer; if (!dt) return;
      const url = dt.getData("text/uri-list") || dt.getData("URL");
      const txt = dt.getData("text/plain");
      if (url && /^https?:/.test(url)) throwArtifact(url, { source: "drop" });
      else if (txt) throwArtifact(txt, { source: "drop" });
      if (dt.files && dt.files.length) {
        Array.from(dt.files).forEach((file) => {
          const reader = new FileReader();
          reader.onload = () => throwArtifact(`// ${file.name}\n` + String(reader.result).slice(0, 8000), { source: "file" });
          reader.onerror = () => throwArtifact(`[파일: ${file.name}] (읽기 실패 — 이름만 기록)`, { source: "file" });
          if (/^text\/|json|javascript|xml|^$/.test(file.type)) reader.readAsText(file);
          else throwArtifact(`[첨부: ${file.name} · ${file.type || "unknown"}]`, { source: "file" });
        });
      }
    });
    dz.addEventListener("paste", (e) => {
      const t = (e.clipboardData || window.clipboardData).getData("text");
      if (t) { e.preventDefault(); throwArtifact(t, { source: "paste" }); }
    });
    dz.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#intake-answer").focus(); }
    });

    // 전역 붙여넣기: 입력창이 아닌 곳에서 ⌘V/Ctrl+V → 유물로
    document.addEventListener("paste", (e) => {
      if (isInteractive(e.target)) return;
      const t = (e.clipboardData || window.clipboardData).getData("text");
      if (t && t.trim()) { e.preventDefault(); throwArtifact(t, { source: "paste" }); }
    });
  }

  /* ── 콜로폰(About/아카이브/연락) ─────────────────────────────────────── */
  function renderColophon(profile, archive) {
    $("#foot-name").textContent = `${profile.name} · ${profile.role}`;
    // 필러
    $("#pillars").innerHTML = (profile.pillars || []).map((p) =>
      `<div class="pillar"><h3>${esc(p.title)}</h3><p>${esc(p.body)}</p><span class="evidence">${esc(p.evidence)}</span></div>`
    ).join("");
    // 아카이브
    const certs = (archive.certifications || []).map((c) => `<li><span class="a-badge">${esc(c)}</span></li>`).join("");
    const awards = (archive.awards || []).map((a) =>
      `<li><span class="a-name">${esc(a.label)}</span><span class="a-date">${esc(a.date)}</span><div class="a-detail">${esc(a.detail)}</div></li>`
    ).join("");
    $("#archive").innerHTML =
      `<div class="archive-block"><h3>자격 · 인증</h3><ul class="cert-list" role="list" style="flex-direction:row;flex-wrap:wrap;display:flex;gap:var(--sp-2)">${certs}</ul></div>
       <div class="archive-block" style="grid-column:span 2"><h3>수상 · 활동</h3><ul class="award-list" role="list">${awards}</ul></div>`;
    // 연락
    $("#contact").innerHTML = (profile.contact || []).map((c) => {
      if (c.href) return `<a class="a-badge" href="${esc(c.href)}">${esc(c.label)} · ${esc(c.value)}</a>`;
      return `<span class="a-badge" title="URL 준비 중">${esc(c.label)} · ${esc(c.value)}</span>`;
    }).join("");
  }

  /* ── 부트스트랩 ────────────────────────────────────────────────────────── */
  async function boot() {
    let data;
    try {
      const res = await fetch("content.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("content.json " + res.status);
      data = await res.json();
    } catch (err) {
      document.querySelector("main").innerHTML =
        `<div class="load-error">콘텐츠를 불러오지 못했습니다.<br><small>${esc(err.message)}</small></div>`;
      return;
    }

    const depthsRoot = $("#depths-root");
    renderDepths(data.depths || [], depthsRoot);
    renderRail(data.depths || []);
    renderCoda((data.depths.find((d) => d.coda) || {}).coda);
    renderColophon(data.profile || {}, data.archive || {});
    setupIntake(data.intake || { questions: [], dropzone: {} });

    // 초기 reveal(첫 화면은 IO 없이 즉시 노출)
    requestAnimationFrame(() => {
      $$(".depth-panel").forEach((p, i) => {
        if (i === 0) p.querySelectorAll(".reveal").forEach((r) => r.classList.add("is-in"));
      });
      fitAll();
    });
    // 폰트 로드 후 재적합
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);

    setupProgress(depthsRoot, $("#depth-announcer"), $("#depth-rail"));
    setupKeyboard(depthsRoot);

    // 진입 시 해시가 인테이크면 커서
    if (location.hash === "#intake") focusIntake();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
