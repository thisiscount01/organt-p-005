'use strict';
// 검증 전용 스크립트(제품 파일 아님) — /tmp 사본에만 패치를 적용해 배포 전 8케이스를
// 미리 통과시켜 본 뒤, 동일 패치를 백엔드(owner)에게 정확히 전달하기 위함.
const fs = require('fs');
const SRC = process.argv[2];
const OLD = `  /* ── 키보드/원탭 깊이 점프 ────────────────────────────────────────────── */
  function isInteractive(t) {
    if (!t) return false;
    const tag = (t.tagName || "").toLowerCase();
    return tag === "textarea" || tag === "input" || tag === "select" || t.isContentEditable === true;
  }
  // 스크롤 완주 시 인테이크로 커서가 자동 이동한 뒤(autofocus)에도, 아직 아무것도
  // 타이핑하지 않은 "빈 입력칸"이면 depth-jump 키를 계속 살려둔다 — 지울 편집 내용이
  // 없어 안전하다. 실제로 답을 타이핑하기 시작하면(비어있지 않으면) 즉시 텍스트
  // 입력을 우선해 편집을 방해하지 않는다(isInteractive 게이트의 "타이핑 중엔
  // 가로채지 않는다"는 취지는 유지, 포커스 트랩만 해소).
  function isEmptyTextField(t) {
    const tag = (t && t.tagName || "").toLowerCase();
    if (tag === "textarea" || tag === "input") return (t.value || "").length === 0;
    return false;
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
      // 입력칸 안에서 실제로 타이핑 중(비어있지 않음)이면 depth-jump를 절대 가로채지
      // 않는다 — j/k/숫자든 화살표든 편집을 방해하지 않는다(첫 글자 유실 방지).
      // 입력칸이 "비어" 있으면(스크롤 완주 후 autofocus 직후처럼 아직 아무것도 안
      // 쓴 상태) j/k/숫자/화살표 전부 depth-jump로 통과시킨다 — 지울 내용이 없어
      // 안전하고, 그렇게 갇히는 포커스 트랩을 해소한다.
      if (inField && !isEmptyTextField(e.target)) return;
      if (k === "ArrowDown" || k === "j" || k === "PageDown") { e.preventDefault(); goto(current() + 1); }
      else if (k === "ArrowUp" || k === "k" || k === "PageUp") { e.preventDefault(); goto(current() - 1); }
      else if (k === "Home") { e.preventDefault(); goto(0); }
      else if (k === "End") { e.preventDefault(); goto(stops.length - 1); }
      else if (k >= "1" && k <= "4") { e.preventDefault(); goto(parseInt(k, 10) - 1); }
    });`;

const NEW = `  /* ── 키보드/원탭 깊이 점프 ────────────────────────────────────────────── */
  function isInteractive(t) {
    if (!t) return false;
    const tag = (t.tagName || "").toLowerCase();
    return tag === "textarea" || tag === "input" || tag === "select" || t.isContentEditable === true;
  }
  // depth-jump vs 타이핑의 판별축 = "필드가 비었나"가 아니라 "포커스가 어떻게
  // 발생했나"다. 스크롤완주 autofocus(focusIntake→프로그램적 focus())와 사용자가
  // 직접 그 빈 칸을 클릭/탭한 경우가 둘 다 "빈 칸"이라 값만으론 구분 불가능해서
  // 한쪽을 고치면 다른 쪽이 깨지는 회귀였다(REPORTS.md 456-481행, QA 최종 보고).
  // 기본값 = 사용자 제스처(true): 클릭/탭·포인터다운이 있었거나 Tab으로 들어오면
  // 항상 타이핑 우선. focusField()로 감싼 프로그램적 focus() 호출의 focusin에서만
  // 이 틱에 false로 내려, 그 순간의 depth-jump 키를 살려둔다. blur 시 기본값(true)
  // 으로 리셋(스펙 준수). pointerdown/mousedown/touchstart는 "이미 포커스된 필드를
  // 다시 클릭"하는 경우(focus 이벤트가 재발화하지 않음)까지 커버하기 위한 보강 신호.
  let expectingProgrammaticFocus = false;
  let fieldFocusedByGesture = true;
  function markGestureFocus(e) {
    if (isInteractive(e.target)) fieldFocusedByGesture = true;
  }
  document.addEventListener("pointerdown", markGestureFocus, true);
  document.addEventListener("mousedown", markGestureFocus, true);
  document.addEventListener("touchstart", markGestureFocus, true);
  document.addEventListener("focusin", (e) => {
    if (!isInteractive(e.target)) return;
    if (expectingProgrammaticFocus) fieldFocusedByGesture = false;
  }, true);
  document.addEventListener("focusout", (e) => {
    if (isInteractive(e.target)) fieldFocusedByGesture = true;
  }, true);
  function focusField(el, opts) {
    if (!el) return;
    expectingProgrammaticFocus = true;
    try { el.focus(opts || { preventScroll: true }); } catch (_) { el.focus(); }
    expectingProgrammaticFocus = false;
  }
  function isEmptyTextField(t) {
    const tag = (t && t.tagName || "").toLowerCase();
    if (tag === "textarea" || tag === "input") return (t.value || "").length === 0;
    return false;
  }
  function setupKeyboard(depthsRoot) {
    const coda = $("#coda");
    const intakeEl = $("#intake");
    const stops = [...$$(".depth-panel", depthsRoot), coda, intakeEl].filter(Boolean);

    function goto(i) {
      const t = stops[Math.max(0, Math.min(stops.length - 1, i))];
      if (!t) return;
      t.scrollIntoView({ behavior: REDUCED.matches ? "auto" : "smooth", block: "start" });
      if (t.hasAttribute("tabindex")) {
        try { t.focus({ preventScroll: true }); } catch (_) { t.focus(); }
      }
    }
    // 상대 이동(j/k/화살표/PageUp/PageDown)의 "현재 위치"는 기하 거리 비교 대신 깊이
    // 배지(data-depth, setupProgress의 단일 소스)를 우선 신뢰한다. 코다/인테이크
    // 자체가 화면에 실제로 보일 때만 그 스톱으로 취급하고, 그 외(콜로폰·푸터까지
    // 스크롤완주한 뒤 포함)는 "마지막 실제 깊이 패널에 있다"로 취급한다 — 예전엔
    // 완주 후 뒤로가기가 깊이 패널이 아닌 코다로 한 칸만 새어, 코다는 배지가 항상
    // memory로 클램프돼 있어 배지가 절대 안 바뀌는 결함이었다(QA가 ArrowUp에서
    // "스크롤은 움직였는데 배지는 그대로"로 잡은 것과 동일 축, REPORTS.md 465행).
    function current() {
      const tail = [coda, intakeEl].filter(Boolean);
      for (let i = tail.length - 1; i >= 0; i--) {
        const el = tail[i];
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.5 && r.bottom > window.innerHeight * 0.1) {
          return DEPTH_ORDER.length + i;
        }
      }
      const idx = DEPTH_ORDER.indexOf(document.body.getAttribute("data-depth"));
      return idx >= 0 ? idx : 0;
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
      // 필드 안에서 "진짜로 편집 중"이면(비어있지 않거나, 비어있어도 사용자가 직접
      // 포커스했으면) depth-jump가 절대 가로채지 않는다. 반대로 비어있고 포커스가
      // 프로그램적(스크롤완주 autofocus)으로 발생했으면 같은 키를 depth-jump로 통과.
      if (inField && (!isEmptyTextField(e.target) || fieldFocusedByGesture)) return;
      if (k === "ArrowDown" || k === "j" || k === "PageDown") { e.preventDefault(); goto(current() + 1); }
      else if (k === "ArrowUp" || k === "k" || k === "PageUp") { e.preventDefault(); goto(current() - 1); }
      else if (k === "Home") { e.preventDefault(); goto(0); }
      else if (k === "End") { e.preventDefault(); goto(stops.length - 1); }
      else if (k >= "1" && k <= "4") { e.preventDefault(); goto(parseInt(k, 10) - 1); }
    });`;

const src = fs.readFileSync(SRC, 'utf8');
if (!src.includes(OLD)) {
  console.error('OLD block not found — refusing to patch (would corrupt).');
  process.exit(2);
}
const count = src.split(OLD).length - 1;
if (count !== 1) {
  console.error('OLD block matched ' + count + ' times (expected exactly 1).');
  process.exit(2);
}
// replace(str, str)는 치환문 안의 "$$" 등을 특수 이스케이프로 해석해 내용을 훼손한다
// (예: "$$(" → "$(" ) — 함수 치환자를 쓰면 리터럴 그대로 삽입된다.
fs.writeFileSync(SRC, src.replace(OLD, () => NEW), 'utf8');
console.log('patched OK:', SRC);

// focusIntake()도 프로그램적 focus로 감싼다(스크롤완주 트랩의 실제 발원지).
const src2 = fs.readFileSync(SRC, 'utf8');
const OLD2 = `  function focusIntake() {
    const ans = $("#intake-answer");
    if (ans) setTimeout(() => { try { ans.focus({ preventScroll: true }); } catch (_) { ans.focus(); } }, REDUCED.matches ? 0 : 420);
  }`;
const NEW2 = `  function focusIntake() {
    const ans = $("#intake-answer");
    if (ans) setTimeout(() => { focusField(ans, { preventScroll: true }); }, REDUCED.matches ? 0 : 420);
  }`;
if (!src2.includes(OLD2)) { console.error('OLD2(focusIntake) not found.'); process.exit(2); }
fs.writeFileSync(SRC, src2.replace(OLD2, () => NEW2), 'utf8');
console.log('patched OK (focusIntake):', SRC);
