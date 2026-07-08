/* 키보드 게이팅(REQ1/REQ2) + 지연 오토포커스 취소 회귀를 "실제 public/app.js 소스"를
   최소 DOM 스텁 위에서 그대로 실행해 검증하는 하네스. 브라우저 자동화(playwright)가
   이 샌드박스에서 근본적으로 막혀 있음을 다각도로 확인한 뒤(절대경로 fs 접근 EACCES —
   node/python/pip/npm 전부 동일 벽) 대안으로 작성. vm으로 실 파일을 그대로 실행하고
   document.addEventListener('keydown', fn)로 등록되는 실제 클로저를 캡처해 합성
   KeyboardEvent-shape 객체로 직접 구동한다(문자 삽입 자체는 브라우저 네이티브 동작이라
   재현 불가하지만, "언제 preventDefault/goto가 불리는가"라는 이번 회귀의 핵심 분기는
   실 코드로 100% 검증 가능). */
"use strict";
const fs = require("fs");
const vm = require("vm");

const appSrc = fs.readFileSync("public/app.js", "utf8");
const contentJson = JSON.parse(fs.readFileSync("public/content.json", "utf8"));

function makeStub(tag) {
  const el = {
    tagName: (tag || "div").toUpperCase(),
    isContentEditable: false,
    offsetHeight: 0,
    offsetTop: 0,
    classList: { add() {}, remove() {}, contains() { return false; } },
    dataset: {},
    style: { setProperty() {} },
    attrs: {},
    _listeners: {},
    _value: "",
    _text: "",
    _html: "",
    _placeholder: "",
    _focused: false,
    _focusCalls: 0,
    _blurCalls: 0,
    _scrolled: false,
    addEventListener(ev, fn) { (el._listeners[ev] = el._listeners[ev] || []).push(fn); },
    removeEventListener() {},
    setAttribute(k, v) { el.attrs[k] = v; },
    removeAttribute(k) { delete el.attrs[k]; },
    hasAttribute(k) { return k in el.attrs; },
    getAttribute(k) { return el.attrs[k]; },
    appendChild(c) { return c; },
    closest() { return null; },
    querySelector() { return makeStub("div"); },
    querySelectorAll() { return []; },
    focus() { el._focused = true; el._focusCalls++; },
    blur() { el._focused = false; el._blurCalls++; },
    scrollIntoView() { el._scrolled = true; },
    getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    remove() {},
    dispatchEvent() { return true; },
  };
  Object.defineProperty(el, "textContent", { get() { return el._text; }, set(v) { el._text = v; } });
  Object.defineProperty(el, "innerHTML", { get() { return el._html; }, set(v) { el._html = v; } });
  Object.defineProperty(el, "value", { get() { return el._value; }, set(v) { el._value = v; } });
  Object.defineProperty(el, "placeholder", { get() { return el._placeholder; }, set(v) { el._placeholder = v; } });
  Object.defineProperty(el, "hidden", { get() { return el._hidden; }, set(v) { el._hidden = v; } });
  return el;
}

const registry = {};
function getEl(sel) {
  if (!registry[sel]) registry[sel] = makeStub("div");
  return registry[sel];
}

class IOStub {
  constructor(cb, opts) { this.cb = cb; this.opts = opts; this.target = null; IOStub.all.push(this); }
  observe(el) { this.target = el; }
  disconnect() {}
}
IOStub.all = [];

const docListeners = {};
const documentStub = {
  addEventListener(ev, fn) { (docListeners[ev] = docListeners[ev] || []).push(fn); },
  removeEventListener() {},
  querySelector(sel) { return getEl(sel); },
  querySelectorAll() { return []; },
  createElement(tag) { return makeStub(tag); },
  getElementById(id) { return getEl("#" + id); },
  body: makeStub("body"),
  documentElement: Object.assign(makeStub("html"), { clientWidth: 1280 }),
  dispatchEvent() { return true; },
  readyState: "complete",
  fonts: undefined,
};

const sandbox = {
  console,
  window: {
    matchMedia() { return { matches: false }; },
    addEventListener() {},
    innerHeight: 900,
    innerWidth: 1280,
    scrollY: 0,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    fetch: undefined, // set below (also global fetch used bare in code)
    requestAnimationFrame: undefined,
    location: { hash: "" },
    IntersectionObserver: IOStub,
    CustomEvent: class { constructor(name, o) { this.type = name; this.detail = o && o.detail; } },
    document: documentStub,
  },
  document: documentStub,
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  location: { hash: "" },
  IntersectionObserver: IOStub,
  CustomEvent: class { constructor(name, o) { this.type = name; this.detail = o && o.detail; } },
  requestAnimationFrame(fn) { fn(); },
  fetch(url) {
    if (String(url).indexOf("content.json") !== -1) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(contentJson) });
    }
    return Promise.resolve({ ok: false });
  },
  setTimeout, clearTimeout, setInterval, clearInterval,
  Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp, Promise, Map, Set,
};
sandbox.window.fetch = sandbox.fetch;
sandbox.window.setTimeout = setTimeout;
sandbox.window.clearTimeout = clearTimeout;
sandbox.window.requestAnimationFrame = sandbox.requestAnimationFrame;
sandbox.globalThis = sandbox;

const ctx = vm.createContext(sandbox);
let bootError = null;
try {
  vm.runInContext(appSrc, ctx, { filename: "app.js(sandboxed)" });
} catch (e) {
  bootError = e;
}

const results = { bootError: bootError ? String(bootError.stack || bootError) : null };

function flushMicrotasks() { return new Promise((r) => setTimeout(r, 0)); }

async function main() {
  if (bootError) {
    console.log(JSON.stringify({ FATAL_BOOT_ERROR: results.bootError }, null, 2));
    return;
  }
  await flushMicrotasks();

  // 실 DOM에서 #intake-answer는 <textarea>다 — 스텁은 selector로만 생성돼 기본 tagName이
  // "DIV"이므로 isInteractive() 판정이 실제와 달라진다. 여기서 실제 태그로 교정한다
  // (이건 하네스의 DOM 스텁 보정일 뿐, app.js 판별 로직 자체는 그대로 실행됨).
  if (registry["#intake-answer"]) registry["#intake-answer"].tagName = "TEXTAREA";

  const kbHandlers = docListeners["keydown"] || [];
  results.keydownHandlerCount = kbHandlers.length;
  const kb = kbHandlers[0];

  const intakeAns = registry["#intake-answer"];
  const bodyTarget = documentStub.body;

  function fakeEvent(target, key, extra) {
    let prevented = false;
    return Object.assign({
      key, target,
      metaKey: false, ctrlKey: false, altKey: false, shiftKey: false,
      defaultPrevented: false,
      preventDefault() { prevented = true; this.defaultPrevented = true; },
      get _prevented() { return prevented; },
    }, extra);
  }

  // ---- REQ1: 포커스가 인테이크(빈 textarea) 안에 있을 때 j/k/1/4 는 절대 가로채지 않는다 ----
  const req1 = {};
  for (const k of ["j", "k", "1", "4", "2", "3", "ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"]) {
    intakeAns._scrolled = false;
    bodyTarget._scrolled = false;
    const before = { ansScrolled: intakeAns._scrolled };
    const ev = fakeEvent(intakeAns, k);
    kb(ev);
    req1[k] = { preventDefaultCalled: ev._prevented, navigatedSomeStop: intakeAns._scrolled || bodyTarget._scrolled };
  }
  results.REQ1_focused_intake_never_intercepted = req1;

  // ---- REQ2: 포커스가 필드 밖(body)일 때 j/k/1/4는 preventDefault + 실제 이동(goto) ----
  const req2 = {};
  const stops = registry["#coda"] && registry["#intake"] ? [registry["#coda"], registry["#intake"]] : [];
  for (const k of ["j", "k", "1", "2", "Home", "End"]) {
    Object.values(registry).forEach((s) => { s._scrolled = false; });
    const ev = fakeEvent(bodyTarget, k);
    kb(ev);
    const movedAny = Object.entries(registry).filter(([sel, s]) => s._scrolled).map(([sel]) => sel);
    req2[k] = { preventDefaultCalled: ev._prevented, movedStops: movedAny };
  }
  results.REQ2_unfocused_depthjump_intercepts = req2;

  // ---- Escape 탈출구: 인테이크 안에서 Escape -> preventDefault + blur ----
  intakeAns._blurCalls = 0;
  const escEv = fakeEvent(intakeAns, "Escape");
  kb(escEv);
  results.escape_blurs_intake = { preventDefaultCalled: escEv._prevented, blurCallCount: intakeAns._blurCalls };

  // ---- IO 오토포커스 threshold 실측(실 코드가 등록한 값) ----
  const autofocusIO = IOStub.all.find((io) => io.target === registry["#intake"]);
  results.autofocus_IO_threshold = autofocusIO ? autofocusIO.opts.threshold : "NOT_FOUND";

  // ---- PM 체인 회귀(420ms 지연 오토포커스 미취소): click→Escape→420ms+대기→depth-jump ----
  // 실제 closure(focusIntake/cancelIntakeFocus)를 IO 콜백·blur 리스너·goto() 경유로 그대로 구동.
  function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
  const blurListeners = (registry["#intake-answer"]._listeners || {}).blur || [];

  // (A) 취소 없이: 오토포커스 예약 → 아무것도 안 하고 500ms 대기 → focus()가 불려야 정상(대조군)
  intakeAns._focusCalls = 0;
  autofocusIO.cb([{ isIntersecting: true, target: registry["#intake"] }], autofocusIO);
  await wait(500);
  results.control_noCancel_autofocus_fires_after_wait = { focusCalls: intakeAns._focusCalls };

  // (B) PM이 잡은 실사용 체인: click(가정)으로 진입 → Escape(blur, cancelIntakeFocus 트리거) →
  //     420ms 이상 대기 → depth-jump 키(j) 입력 시 재포커스 없이 정상 네비게이션돼야 한다.
  //     새 IO를 하나 더 만들어(실제로는 매 로드 1회지만 테스트 격리를 위해) 재현.
  const io2 = new IOStub(autofocusIO.cb, autofocusIO.opts);
  io2.observe(registry["#intake"]);
  intakeAns._focusCalls = 0;
  io2.cb([{ isIntersecting: true, target: registry["#intake"] }], io2); // 오토포커스 예약(setTimeout 420ms)
  // Escape로 탈출 -> blur 이벤트 리스너(cancelIntakeFocus) 수동 발화(브라우저 blur 이벤트 시뮬레이션)
  const escEv2 = fakeEvent(intakeAns, "Escape");
  kb(escEv2);
  blurListeners.forEach((fn) => fn());
  await wait(500); // 420ms 타이머가 취소됐다면 이 시점에 focus()가 불리면 안 됨
  const focusCallsAfterCancel = intakeAns._focusCalls;
  Object.values(registry).forEach((s) => { s._scrolled = false; });
  const jEv = fakeEvent(bodyTarget, "j");
  kb(jEv);
  results.PM_chain_click_escape_wait_then_depthjump = {
    focusCallsBeforeJKey: focusCallsAfterCancel, // 0이어야 정상(타이머 취소됨)
    jKey_preventDefaultCalled: jEv._prevented,
    jKey_navigated: Object.entries(registry).some(([sel, s]) => s._scrolled),
  };

  console.log(JSON.stringify(results, null, 2));
}
main();
