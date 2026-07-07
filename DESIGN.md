# 딥다이브 포트폴리오 — 아트 디렉션 시스템 (변도진)

> 소유: 디자이너(아트 디렉션) · 이건 프론트·모션·백엔드가 기다리는 **상류 계약**이다.
> 콘텐츠 텍스트/유물의 실제 내용은 브랜드 스토리텔러가 채운다 — 여기선 **슬롯의 형태**만 정한다.

## 산출물 (워크스페이스 루트 기준)
| 파일 | 무엇 | 소비자 |
|---|---|---|
| `public/tokens.css` | 디자인 토큰 단일 소스(색·타이포·스페이싱·모션·강조 z) | 프론트·모션·백엔드 |
| `public/artifacts.css` | 유물/깊이무대/강조등급 재사용 컴포넌트 클래스 | 프론트(그대로 재사용) |
| `public/depth-schema.json` | **깊이 4단 시각슬롯 스키마**(라벨·강조등급·유물타입·필드) | 프론트(렌더 계약 도출)·백엔드(빌드 검증) |
| `public/style-guide.html` | 라이브 스타일가이드/무드 + 대비 검사기 | 팀 전체(기준 확인) |
| `DESIGN.md` | 이 문서 — 근거·규칙·소비법 | 팀 전체 |

## 북극성 컨셉 — "한 줄이 초점 잡히며 확장"
'깊이 파고드는 사람'을 **수직 낙하가 아니라 초점/해상도 상승**으로 은유한다.
한 줄 `print("Hello, Python!")`이 흐릿하게 떠 있다가 초점이 잡히며
`surface → bytecode → interpreter → memory` 로 확장 — CPython의 단면을 내려간다.
감정선: **궁금증 → 몰입 → 경외** → "이 사람과 1시간 이야기하고 싶다".

## 1) 아트 디렉션 시스템

### 타이포 위계 — 모노스페이스가 주인공
- 코드/유물: **JetBrains Mono**(라틴) + **Nanum Gothic Coding**(한글 모노 폴백) — 한글 코드도 고정폭 유지.
- 본문: **Pretendard** — 절제된 한글 산세리프. (전부 SIL OFL 오픈폰트)
- 스케일: `--fs-hero`(단 한 줄) > `--fs-display`(깊이 타이틀) > h1/h2/h3 > body(17px) > code > caption > micro(라벨).
- 규칙: 한 화면에 대형 타입은 **focal 1개만**. 본문은 `--measure`(68ch)로 폭 제한.

### 컬러 토큰 — 터미널 다크 + 단일 액센트
- 깊이별 배경 4단(surface #0D1117 → memory #08090D): 내려갈수록 어두워져 '깊이'를 색으로도 전달.
- **단일 액센트 = phosphor mint `#5EEAD4`** — 시선 착지·'살아있음' 신호로만(남발 금지).
- 텍스트 3단(primary/secondary/tertiary) + 코드 신택스 6색 서브셋.
- **대비: 전 조합 WCAG AA 이상**(본문·2차·액센트·코드색 대부분 AAA, tertiary/comment ≥5.0:1 AA).
  실측치는 `style-guide.html`의 라이브 검사기가 토큰값으로 재계산해 표로 증명.

### 그리드·여백
- 8px 베이스라인 스페이싱(`--sp-1…11`). 콘텐츠 프레임 `--stage-max 1200px`, 좌우 `--gutter`(20–80px clamp).
- 12열 그리드. 무대 콘텐츠는 세로 중앙 정렬. **첫 화면 여백 ≥70%** — 밀도 아닌 여백으로 감탄.

### 한 인물 = 사고의 유물 (얼굴 사진 없음)
- 인물을 **커밋·발표 슬라이드·바이트코드·풀이 흔적·메모리 셀**로 표현. 모든 유물은 실제 사실 하나를 담는다.
- 금지: 인물 사진/아바타/스톡, 기능 6칸 그리드, 의미 없는 장식(순수 파티클·3D).

## 2) 깊이 4단 시각슬롯 스키마 → `public/depth-schema.json`
- depth enum = `surface | bytecode | interpreter | memory` (+저장 시 `unassigned`).
- **강조등급**: `focal`(뷰당 1, 액센트 허용, 카운트 O) · `support`(≤2, 액센트 채움 금지, 카운트 O) · `ambient`(배경 텍스처, 카운트 X, aria-hidden).
- **유물타입 10종**(각 `fields` 명시): code-line · bytecode-dump · call-stack · memory-cell · commit · slide · trace · prose · spec-badge · link-out.
  → 프론트는 이 `artifactTypes[*].fields`를 그대로 콘텐츠 JSON 필드로 승격하면 렌더 계약이 도출된다.
- 각 깊이: 라벨(ko+code)·microLabel·tagline 슬롯·배경 토큰·focal 유물타입·허용 유물타입·maxSupport·모션노트.
- 진행도 0~1 4구간 밴드(프론트 방출·모션 소비). reduced-motion: data-depth 교체 + 120ms 크로스페이드 + aria-live.

## 3) 첫 화면 게이트(디자인 성공기준, 실측)
- 카운트 블록 **≤3** = focal 1 + support ≤2. ambient 제외. **동급 강조 0**. 5초 내 "깊다" 판독.
- `style-guide.html` #01 섹션이 이 화면을 실제로 시연(카운트 3 · 동급 강조 0 · 액센트 커서 1점).

## 폰트 로드(검증된 CDN, 프론트가 통합 엔트리에서 로드)
```html
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Nanum+Gothic+Coding&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css">
```

## 소비법(프론트/모션)
1. 통합 엔트리 HTML에서 `tokens.css` → `artifacts.css` 순으로 로드(둘 다 하드코딩 색 없음, 변수만).
2. depth별 무대는 `.depth-stage` + `background:var(--bg-{depth})`. 유물은 `.artifact` + `.a-{type}` 클래스 재사용.
3. 강조 위계는 `.emph-focal/.emph-support/.emph-ambient`(z-index 토큰 포함) — 첫 화면 게이트 자동 충족.
4. 모션 이징/지속시간은 `--ease-*`/`--dur-*` 토큰 사용(진행도 0~1 방출·소비 계약은 프론트/모션 소유).
5. reduced-motion 폴백은 tokens.css의 미디어쿼리가 지속시간을 0/120ms로 자동 하향(순간이동 금지).

## 협의 필요 지점(계약 순서 ①→②→③)
① 디자이너(완료: 이 스키마) → ② 프론트가 콘텐츠 JSON 최종형 확정 → ③ 백엔드 빌드 매핑.
유물타입 fields가 실제 콘텐츠 성격과 어긋나면 스토리텔러/프론트와 Info로 조정.
