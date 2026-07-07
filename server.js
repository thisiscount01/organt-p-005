/* ============================================================================
   DEEP DIVE PORTFOLIO — 서버
   ⚠ 소유권 주의: 영속·저장·인테이크 서버는 백엔드 ③의 소유입니다.

   [오너십 이관] 2026-07-07부로 이 파일 산출물 오너십을 프론트(②)에서 백엔드(③) 단독으로
   이관함 — 근거: GOAL.md Interfaces("소유권: 이 구간 완료 전까지 백엔드 단독"), MINUTES
   T-162313-1 2R(PM 1R 조건1: "소유권은 이제 백엔드 단독 확정 — 다른 owner 재개입 금지").
   PM 승인. 하드닝(원자적 쓰기·동시성·413/500/경로순회 방어)·기동증명·deploy는 백엔드가
   전담하며, 프론트는 이 이관 이후 이 파일에 재개입하지 않습니다.

   [2026-07-07 백엔드 하드닝 — 4건]
     1. 원자적 쓰기 — tmp 파일에 쓰고 rename으로 교체(쓰다 중단돼도 DATA_FILE 손상 없음).
     2. 쓰기 실패 시 500 정직화 — 디스크 실패를 200/201로 속이지 않음.
     3. 바디 1MB 초과 시 413 JSON 응답(Content-Length 사전 거부 + 스트리밍 중 거부, 커넥션만
        끊지 않음).
     4. 경로순회 방어 유지 + 잘못된 JSON/메서드 불일치/미존재 라우트까지 전부 일관된 JSON
        에러(`{error: "..."}` , 브랜드 톤=담백·절제, 스택트레이스·"Internal Server Error"
        날것 텍스트 노출 0). 전체 라우팅을 try/catch로 감싸 예기치 못한 예외(예: 잘못된
        percent-encoding으로 decodeURIComponent가 던지는 URIError)도 프로세스 크래시 대신
        400/500 JSON으로 흡수.
   여전히 무의존(Node 표준 http/fs/path/crypto)입니다.

   [프론트가 확정한 클라이언트 계약 — 백엔드 ③가 이 형태로 방출/수용]
     GET    /api/intake        → { entries: Entry[] }        (조회, 없으면 [])
     POST   /api/intake        body: Entry(부분) → { entry: Entry }  (원문 유실 없이 적재)
     DELETE /api/intake/:id    → { ok: true }
     Entry = { id, type:'answer'|'artifact', kind, depth, content, qid?, prompt?, source?, createdAt }
     depth enum = surface|bytecode|interpreter|memory|unassigned
   정적: public/ (index.html·app.js·*.css·content.json). SPA 아님(정적 파일 직접 서빙).
   ============================================================================ */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");
const DATA_FILE = process.env.INTAKE_DATA || path.join(__dirname, "intake-data.json");
const MAX_BODY = 1024 * 1024; // 1MB

const DEPTHS = new Set(["surface", "bytecode", "interpreter", "memory", "unassigned"]);
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2",
  ".png": "image/png", ".jpg": "image/jpeg", ".txt": "text/plain; charset=utf-8",
};

// 브랜드 톤(담백·절제) 에러 문구 — 스택트레이스·"Internal Server Error" 날것 텍스트 0
const ERR = {
  badUrl: "요청 경로를 읽을 수 없습니다.",
  badJson: "요청 본문을 읽을 수 없습니다.",
  badEntry: "내용이 비어 있어 저장할 수 없습니다.",
  tooLarge: "요청 본문이 너무 큽니다(최대 1MB).",
  notFound: "찾을 수 없는 경로입니다.",
  methodNotAllowed: "지원하지 않는 요청 방식입니다.",
  forbidden: "허용되지 않은 경로입니다.",
  storeFailed: "저장에 실패했습니다. 잠시 후 다시 시도해주세요.",
  internal: "일시적인 오류가 발생했습니다.",
};

function sendJson(res, code, obj) {
  if (res.headersSent) return;
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}
function sendError(res, code, message) {
  sendJson(res, code, { error: message });
}

function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const j = JSON.parse(raw);
    return Array.isArray(j.entries) ? j.entries : [];
  } catch (_) {
    return []; // 파일 없음/파손 시 빈 목록(부팅에 DB/자격증명 불필요 — 정직한 폴백)
  }
}

// 하드닝 1+2: tmp에 쓰고 rename으로 교체(원자적) — 실패하면 절대 성공을 가장하지 않고 정직하게 알림
function writeData(entries) {
  const dir = path.dirname(DATA_FILE);
  const tmp = path.join(dir, `.${path.basename(DATA_FILE)}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`);
  try {
    fs.writeFileSync(tmp, JSON.stringify({ entries }, null, 2), "utf8");
    fs.renameSync(tmp, DATA_FILE); // 같은 파일시스템 내 rename은 원자적 — 쓰다 중단돼도 원본 훼손 없음
    return { ok: true };
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) { /* tmp 자체가 안 생겼을 수 있음 — 무시 */ }
    console.error("[intake] persist failed:", e.message);
    return { ok: false, error: e.message };
  }
}

function sanitizeEntry(input) {
  if (!input || typeof input !== "object") return null;
  const now = Date.now();
  const type = input.type === "artifact" ? "artifact" : "answer";
  const depth = DEPTHS.has(input.depth) ? input.depth : "unassigned";
  const content = typeof input.content === "string" ? input.content : "";
  if (!content.trim()) return null; // 원문 없으면 거부(유실 방지 원칙과 별개 — 빈 카드 방지)
  return {
    id: typeof input.id === "string" && input.id ? input.id : "e_" + now.toString(36) + Math.random().toString(36).slice(2, 8),
    type, kind: typeof input.kind === "string" ? input.kind : "text", depth,
    content, // 원문 그대로 적재(유실 0)
    qid: input.qid || null, prompt: input.prompt || null, source: input.source || null,
    createdAt: typeof input.createdAt === "number" ? input.createdAt : now,
  };
}

function handleIntakePost(req, res) {
  // 하드닝 3a: Content-Length가 미리 초과를 알리면 몸통을 읽지도 않고 바로 거부
  const declaredLen = parseInt(req.headers["content-length"], 10);
  if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY) {
    return sendError(res, 413, ERR.tooLarge);
  }

  let body = "";
  let settled = false; // 413로 이미 응답했으면 이후 end에서 중복 응답 금지
  req.on("data", (chunk) => {
    if (settled) return;
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY) {
      // 하드닝 3b: Content-Length가 없거나(청크드) 거짓말인 케이스 — 스트리밍 중 실측으로 거부
      settled = true;
      sendError(res, 413, ERR.tooLarge);
      req.destroy();
    }
  });
  req.on("error", () => { /* 클라이언트 조기 종료 등 — 조용히 무시(이미 응답했거나 응답 불필요) */ });
  req.on("end", () => {
    if (settled) return;
    let parsed;
    try {
      parsed = JSON.parse(body || "{}");
    } catch (_) {
      return sendError(res, 400, ERR.badJson);
    }
    const entry = sanitizeEntry(parsed);
    if (!entry) return sendError(res, 400, ERR.badEntry);

    const entries = readData();
    const idx = entries.findIndex((e) => e.id === entry.id);
    if (idx >= 0) entries[idx] = entry; else entries.unshift(entry);

    const result = writeData(entries);
    if (!result.ok) return sendError(res, 500, ERR.storeFailed); // 하드닝 2: 디스크 실패를 201로 속이지 않음
    return sendJson(res, 201, { entry });
  });
}

function handleIntakeDelete(res, id) {
  const entries = readData();
  const next = entries.filter((e) => e.id !== id);
  const result = writeData(next);
  if (!result.ok) return sendError(res, 500, ERR.storeFailed); // 하드닝 2
  return sendJson(res, 200, { ok: true });
}

// 하드닝 4(경로순회 방어 유지): PUBLIC 루트 바깥으로 벗어나면 무조건 거부.
// startsWith(PUBLIC) 단독 비교는 "/public-evil" 같은 형제 디렉터리를 오탐 통과시킬 수 있어
// 구분자를 포함한 접두 비교(PUBLIC + path.sep) 또는 완전 일치로 정규화해 비교한다.
function serveStatic(req, res, p) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return sendError(res, 405, ERR.methodNotAllowed);
  }
  const rel = p === "/" ? "/index.html" : p;
  const filePath = path.normalize(path.join(PUBLIC, rel));
  if (filePath !== PUBLIC && !filePath.startsWith(PUBLIC + path.sep)) {
    return sendError(res, 403, ERR.forbidden);
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) return sendError(res, 404, ERR.notFound);
    const ext = path.extname(filePath).toLowerCase();
    const headers = { "Content-Type": MIME[ext] || "application/octet-stream" };
    if (req.method === "HEAD") { res.writeHead(200, headers); return res.end(); }
    res.writeHead(200, headers);
    res.end(buf);
  });
}

function handleRequest(req, res) {
  let u;
  try {
    u = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  } catch (_) {
    return sendError(res, 400, ERR.badUrl);
  }
  let p;
  try {
    p = decodeURIComponent(u.pathname); // 잘못된 %-인코딩은 URIError를 던짐 — 여기서 흡수
  } catch (_) {
    return sendError(res, 400, ERR.badUrl);
  }

  if (p === "/healthz") return sendJson(res, 200, { ok: true, entries: readData().length });

  // ---- API ----
  if (p === "/api/intake") {
    if (req.method === "GET") return sendJson(res, 200, { entries: readData() });
    if (req.method === "POST") return handleIntakePost(req, res);
    res.setHeader("Allow", "GET, POST");
    return sendError(res, 405, ERR.methodNotAllowed);
  }
  if (p.startsWith("/api/intake/")) {
    const id = p.slice("/api/intake/".length);
    if (!id) return sendError(res, 404, ERR.notFound);
    if (req.method === "DELETE") return handleIntakeDelete(res, id);
    res.setHeader("Allow", "DELETE");
    return sendError(res, 405, ERR.methodNotAllowed);
  }
  if (p.startsWith("/api/")) {
    return sendError(res, 404, ERR.notFound); // 계약에 없는 API 경로 — 조용한 빈 응답 대신 명시적 404
  }

  // ---- 정적 ----
  return serveStatic(req, res, p);
}

const server = http.createServer((req, res) => {
  try {
    handleRequest(req, res);
  } catch (e) {
    // 최종 안전망: 어떤 예외도 스택트레이스로 새지 않고 일관된 JSON 500으로 흡수
    console.error("[intake] unhandled:", e && e.stack ? e.stack : e);
    sendError(res, 500, ERR.internal);
  }
});

server.listen(PORT, () => console.log(`deep-dive portfolio on :${PORT}  (data: ${DATA_FILE})`));
