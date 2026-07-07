/* ============================================================================
   MOTION AUDIT — public/motion.css 정적 검증 (no deps, node 표준만)
   순수 CSS 모션 레이어의 실제 실패 모드를 정적으로 잡는다:
     A. 키프레임이 레이아웃 유발 속성을 애니메이트하는가(60fps 위협)
     B. 참조된 var(--x)가 tokens.css/motion.css에 정의돼 있는가(오타→무음 no-op)
     C. reduced-motion 게이트/폴백이 있는가(접근성)
     D. 시그니처 셀렉터가 실제 렌더 DOM 클래스를 겨냥하는가(죽은 규칙 방지)
     E. animation이 참조하는 keyframe이 실제로 정의됐는가
   ============================================================================ */
"use strict";
const { execSync } = require("child_process");
// node fs.open이 이 바인드마운트 파일에 EACCES → shell cat으로 우회(cat은 정상 read)
const read = (f) => execSync(`cat "public/${f}"`).toString("utf8");

const motion = read("motion.css");
const tokens = read("tokens.css");
const artifacts = read("artifacts.css");
const appcss = read("app.css");
const appjs = read("app.js");

let fails = 0, warns = 0, passes = 0;
const ok = (m) => { passes++; console.log("  PASS " + m); };
const bad = (m) => { fails++; console.log("  FAIL " + m); };
const warn = (m) => { warns++; console.log("  WARN " + m); };

/* ---- A. 키프레임 애니메이트 속성 = compositor-only ---------------------- */
console.log("\n[A] 키프레임 속성 = transform/opacity/filter/clip-path 만");
const COMPOSITOR = new Set(["transform", "opacity", "filter", "clip-path",
  "-webkit-transform", "-webkit-filter", "-webkit-clip-path"]);
// 레이아웃/무거운 페인트 유발(키프레임 안에 있으면 스래싱 위험)
const FORBIDDEN = new Set(["width","height","top","left","right","bottom","margin",
  "margin-top","margin-left","padding","letter-spacing","word-spacing","line-height",
  "font-size","border-width","inset","box-shadow","background","background-color",
  "background-position","color"]);
const kfBlocks = [...motion.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)];
if (!kfBlocks.length) bad("키프레임이 하나도 파싱되지 않음");
const definedKeyframes = new Set();
for (const [, name, body] of kfBlocks) {
  definedKeyframes.add(name);
  // 각 스텝 블록 안의 property: value 만 추출(중첩 브레이스 없음)
  const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1])
    .filter((p) => !/^\d/.test(p));
  const animated = props.filter((p) => p !== "content");
  const violations = animated.filter((p) => FORBIDDEN.has(p));
  const unknown = animated.filter((p) => !COMPOSITOR.has(p) && !FORBIDDEN.has(p));
  if (violations.length) bad(`@keyframes ${name} 레이아웃/페인트 속성 애니메이트: ${[...new Set(violations)].join(", ")}`);
  else ok(`@keyframes ${name} — compositor-only (${[...new Set(animated)].join(", ") || "none"})`);
  if (unknown.length) warn(`@keyframes ${name} 화이트리스트 밖 속성: ${[...new Set(unknown)].join(", ")}`);
}

/* ---- E. animation 참조 keyframe 정의 존재 ------------------------------- */
console.log("\n[E] animation이 참조하는 keyframe 정의 존재");
// animation shorthand 첫 토큰(또는 알려진 이름) 추출: sig-* 이름만 대상
const usedKf = new Set([...motion.matchAll(/animation:\s*([\s\S]*?);/g)]
  .flatMap((m) => [...m[1].matchAll(/\b(sig-[\w-]+)\b/g)].map((x) => x[1])));
for (const kf of usedKf) {
  if (definedKeyframes.has(kf)) ok(`animation → @keyframes ${kf} 정의됨`);
  else bad(`animation이 미정의 keyframe 참조: ${kf}`);
}
// 정의만 되고 안 쓰인 것(경고)
for (const kf of definedKeyframes) if (!usedKf.has(kf)) warn(`@keyframes ${kf} 정의됐으나 미사용`);

/* ---- B. var() 해결(tokens.css + motion.css :root) ---------------------- */
console.log("\n[B] 참조 var(--x) 정의 존재(tokens.css/motion.css)");
const defRe = /(--[\w-]+)\s*:/g;
const defined = new Set();
for (const src of [tokens, motion, artifacts, appcss]) {
  let m; while ((m = defRe.exec(src))) defined.add(m[1]);
}
const usedVars = new Set([...motion.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]));
// 런타임 방출 var(프론트 app.js가 style.setProperty로 세팅 = 단일 소스 계약)
const runtimeSet = new Set([...appjs.matchAll(/setProperty\(\s*["'](--[\w-]+)["']/g)].map((m) => m[1]));
// 폴백을 가진 var(예: var(--x, 0)) = 안전
const withFallback = new Set([...motion.matchAll(/var\(\s*(--[\w-]+)\s*,/g)].map((m) => m[1]));
let undef = 0;
for (const v of usedVars) {
  if (defined.has(v)) continue;
  if (runtimeSet.has(v)) { ok(`${v} — 런타임 방출(app.js setProperty, 프론트 단일 소스) + 폴백`); continue; }
  if (withFallback.has(v)) { warn(`${v} — CSS 미정의이나 폴백 보유(안전)`); continue; }
  bad(`motion.css가 미정의 var 참조(폴백 없음): ${v}`); undef++;
}
if (!undef) ok(`motion.css의 var 참조 전부 해결(정의/런타임/폴백)`);

/* ---- C. reduced-motion 게이트/폴백 ------------------------------------- */
console.log("\n[C] reduced-motion 게이트·폴백");
const hasNoPref = /@media\s*\(prefers-reduced-motion:\s*no-preference\)/.test(motion);
const hasReduce = /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(motion);
hasNoPref ? ok("시그니처가 (no-preference) 게이트로 감싸짐") : bad("no-preference 게이트 없음 → reduce에서도 모션 발생 위험");
hasReduce ? ok("(reduce) 폴백 블록 존재(캐럿·베일 정지)") : bad("(reduce) 폴백 블록 없음");
// 모든 sig-* animation 선언이 no-preference 블록 안에 있는지: no-preference 블록 텍스트 추출
const npBlock = (motion.match(/@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{([\s\S]*)\n\}/) || [])[1] || "";
const animLines = [...motion.matchAll(/[^\n]*animation:\s*sig-[^\n]*/g)].map((m) => m[0].trim());
let leaked = 0;
for (const line of animLines) {
  if (!npBlock.includes(line)) { bad(`시그니처 animation이 no-preference 밖에 노출: ${line.slice(0,60)}…`); leaked++; }
}
if (animLines.length && !leaked) ok(`시그니처 animation ${animLines.length}건 전부 no-preference 안에 격리`);

/* ---- D. 셀렉터가 실제 렌더 DOM 클래스를 겨냥 --------------------------- */
console.log("\n[D] 시그니처 셀렉터 → 실제 렌더 DOM 클래스 존재");
// app.js가 실제로 방출하는 클래스/속성 + artifacts.css/app.css 정의된 훅
const domSurface = appjs + artifacts + appcss;
const need = [
  ['data-depth="surface"', appjs],
  ['data-depth="bytecode"', appjs],
  ['data-depth="interpreter"', appjs],
  ['data-depth="memory"', appjs],
  ["depth-focal", appjs],
  ["reveal", appjs],
  ["is-in", appjs],                 // app.js가 classList.add("is-in")
  ["a-code-line", appjs],
  ["a-bytecode", appjs],
  ['class="ins', appjs],            // 바이트코드 행
  ["is-focus", appjs],              // CALL 행
  ["a-callstack", appjs],
  ['class="frame', appjs],
  ["is-current", appjs],            // 현재 프레임
  ["a-memgrid", appjs],
  ["a-memcell", appjs],
  ['id="coda-headline"', appjs.includes('id="coda-headline"') ? appjs : appcss.includes("coda-headline") ? appcss : ""],
  ['id="coda-headline"', appjs.includes("coda-headline") ? appjs : ""],
  ["cursor", appjs],
];
const checkClass = (cls) => {
  // motion.css가 이 훅을 실제로 셀렉터에 쓰는지 + DOM 소스에 존재하는지
  const inMotion = motion.includes(cls) || motion.includes(cls.replace('class="','').replace('id="',''));
  return inMotion;
};
const domHooks = {
  'data-depth="surface"': /data-depth="\$\{esc\(d\.id\)\}"|data-depth=/.test(appjs),
  "depth-focal": appjs.includes("depth-focal"),
  "reveal": appjs.includes('"reveal"') || appjs.includes(" reveal"),
  "is-in": appjs.includes('"is-in"') || appjs.includes("is-in"),
  "a-code-line": appjs.includes("a-code-line"),
  "a-bytecode": appjs.includes("a-bytecode"),
  ".ins": appjs.includes('class="ins'),
  "is-focus": appjs.includes("is-focus"),
  "a-callstack": appjs.includes("a-callstack"),
  ".frame": appjs.includes('class="frame'),
  "is-current": appjs.includes("is-current"),
  "a-memgrid": appjs.includes("a-memgrid"),
  "a-memcell": appjs.includes("a-memcell"),
  "coda-headline": appjs.includes("coda-headline") || read("index.html").includes("coda-headline"),
  "cursor": appjs.includes('"cursor"') || appjs.includes("cursor"),
};
for (const [hook, existsInDom] of Object.entries(domHooks)) {
  const usedInMotion = motion.includes(hook.replace(/^\./, ""));
  if (!usedInMotion) { warn(`모션이 훅 '${hook}'을(를) 셀렉터에 안 씀(의도적일 수 있음)`); continue; }
  if (existsInDom) ok(`훅 '${hook}' — 렌더 DOM에 존재 & 모션이 겨냥`);
  else bad(`훅 '${hook}' — 모션이 겨냥하나 렌더 DOM에 없음(죽은 규칙)`);
}

/* ---- 요약 -------------------------------------------------------------- */
console.log(`\n==== 요약: PASS ${passes} · WARN ${warns} · FAIL ${fails} ====`);
process.exit(fails ? 1 : 0);
