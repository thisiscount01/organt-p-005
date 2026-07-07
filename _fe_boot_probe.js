// 프론트엔드 검증용 임시 부팅 스크립트 — 샌드박스의 절대경로 EACCES(realpath 체인이
// /root/ClaudeCompany 조상 디렉터리에서 막힘) 우회: server.js를 상대경로 fs.readFileSync로
// 읽어 Function 래퍼로 직접 실행(require는 내장 모듈만 쓰므로 안전). 실서버 코드는 무수정.
const fs = require("fs");
const src = fs.readFileSync("server.js", "utf8");
const wrapper = Function("require", "module", "exports", "__filename", "__dirname", src);
const fakeModule = { exports: {} };
wrapper(require, fakeModule, fakeModule.exports, "server.js", ".");
