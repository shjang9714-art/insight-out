# 지시서 423 — MCP 아카이브 write + list (신규 archive 스코프)

> 작성: 플래너(Opus) · 2026-07-24 · Teams 봇 "기사 아카이브 명령 + 아카이브 수신"(VDI-Teams봇 설계 C)
> 근거: `archives`·`archive_items` 스키마 + MCP 스코프/도구 패턴(421·422)
> 협업 루프: 검증용 브랜치 `agent/423-mcp-archive`(from `origin/main`) → 재현검증 → "커밋해" → 머지.
> 번호: 423 · git author David(yjhead@gmail.com) · **SQL 0.** (스키마 변경 없음 — 스코프는 코드 상수)

---

## 0. 한 줄
사내 에이전트가 **기사를 아카이브**(`content_archive`)하고 **자기 아카이브를 조회**(`archive_list`)하게 한다. read-only 토큰과 분리된 **신규 `archive` 스코프**로만 동작하고, 쓰기는 **토큰 계정(actor.userId)** 아래로만.

---

## 1. 착수 전 확인 + 설계 전제
- 테이블 `archives`(id, **user_id**, name, description) = 사용자별 명명 컬렉션. `archive_items`(archive_id, content_id XOR youtube_video_id, note, order, added_at). SQL 스키마 변경 없음.
- 기존 아카이브 메일 발송 `src/app/api/email/send-archive/route.ts`(브라우저 세션 기반) — **이번 슬라이스에서 안 건드림**(메일/Teams 전달은 PA가 archive_list를 읽어 처리).
- MCP 스코프(`src/lib/mcp/scopes.ts`): 현재 `read·ops·reports·publish`. **`archive` 신규 추가.**
- ⚠️ **설계 전제(중요)**: 봇 토큰은 1개 계정(actor.userId)에 매핑된다. 따라서 **아카이브는 그 토큰 계정 아래** 쌓인다. Teams 개인별 사용자→인사이트아웃 계정 매핑은 이번 범위 아님(후속). 이 전제를 도구 description·§7에 명시.

## 2. 구현

### 2.1 신규 스코프 `archive` (`src/lib/mcp/scopes.ts`)
- `MCP_SCOPES`에 `'archive'` 추가.
- `MCP_SCOPE_LABEL.archive = '아카이브'`, `MCP_SCOPE_DESC.archive = '기사를 토큰 계정의 아카이브에 담고 조회 (개인 컬렉션 쓰기)'`.
- ⚠️ 토큰 발급 UI(`admin/mcp-tokens`)가 `MCP_SCOPES`를 순회해 자동 노출되는지 확인(그러면 별도 수정 불필요). 아니면 발급 화면에 `archive` 체크박스 노출되게 최소 반영.

### 2.2 신규 도구 파일 `src/lib/mcp/tools/archive.ts` → `registerArchiveTools(server)`
421/422 골격 복제. **단 스코프는 `hasScope(actor, 'archive')`.** 클라이언트는 `createAdminClient()`(RLS 우회)이되 **모든 쿼리를 `actor.userId`로 스코프**(타인 데이터 절대 접근 금지).

**`content_archive` — 기사 아카이브(write)**
- inputSchema: `content_id: z.string().uuid()`, `note: z.string().optional()`, `archive_name: z.string().optional()`.
- 동작:
  1. `guard(extra, 'archive')` — actor 확인.
  2. 대상 아카이브 결정: `archive_name` 있으면 그 이름의 actor 아카이브 조회, 없으면 생성. 미지정이면 **기본 아카이브**(예: 이름 `'봇 아카이브'`)를 actor 것 중에서 찾고 없으면 생성. **전부 `user_id = actor.userId`.**
  3. `content_id`가 **발행 콘텐츠(status='published')인지 확인** 후, `archive_items`에 insert(archive_id, content_id, note). **이미 있으면 중복 방지**("이미 아카이브됨" 반환).
  4. 결과: 아카이브명 + 담긴 기사 제목.

**`archive_list` — 내 아카이브 조회(read personal)**
- inputSchema: `archive_name: z.string().optional()`, `limit: z.number().int().min(1).max(100).optional()`.
- 동작: `archives.eq('user_id', actor.userId)` 목록 + 각 아카이브의 `archive_items`(content 조인: 제목·original_url·published_at). `archive_name` 지정 시 그 컬렉션만.
- 출력: 아카이브별 항목(제목·URL·note). content_id는 `content_get`으로 본문 연결 가능함을 안내.
- **스코프 `archive`**(개인 데이터라 public `read`와 구분).

### 2.3 등록 (`src/app/api/mcp/route.ts`)
- `registerArchiveTools(server)` 추가 호출.

## 3. 하지 말 것
- **`actor.userId` 외 다른 사용자의 archives/archive_items 접근·수정 금지**(admin client라 반드시 명시적 user_id 필터).
- 발행 아님(초안) 콘텐츠 아카이브 금지(§2.2 3).
- `send-archive` 메일 라우트·`archives` 브라우저 로직 무수정.
- `publish`/`reports`/`ops` 스코프로 이 도구 열지 않기 — **오직 `archive`**.
- 기존 read/write 도구·인증 코어 무수정(스코프 상수 추가 외).
- 새 테이블·SQL 없음.

## 4. 회귀 가드
1. `archive` 스코프 토큰으로 `content_archive` → 발행 기사 1건이 **토큰 계정** 아카이브에 담긴다.
2. 같은 기사 재요청 → "이미 아카이브됨"(중복 안 생김).
3. `archive_list` → **그 계정 아카이브만** 조회(타 계정 안 보임).
4. `archive` 스코프 없는(read 전용) 토큰 → 두 도구 모두 forbidden.
5. 미발행/없는 content_id → 거부.
6. 기존 421·422·read 도구, send-archive 메일 무영향.
7. 도구명 중복 없음(전체 유니크).

## 5. 검증
```bash
npx tsc --noEmit && npm run lint && npm run build
grep -n "archive" src/lib/mcp/scopes.ts                     # 스코프 추가
grep -n "content_archive\|archive_list\|hasScope(actor, 'archive')\|actor.userId" src/lib/mcp/tools/archive.ts
grep -n "registerArchiveTools" src/app/api/mcp/route.ts
grep -n "status.*published" src/lib/mcp/tools/archive.ts     # 발행 콘텐츠만 아카이브
# actor.userId 외 필터 없는 archives 접근 없어야 (육안)
for f in read read-analytics archive ops reports; do git show HEAD:src/lib/mcp/tools/$f.ts 2>/dev/null | grep -oP "registerTool\(\s*'\K[a-z_]+"; done | sort | uniq -d
git diff --stat origin/main
```
**라이브(archive 스코프 토큰)**
- [ ] content_archive → 담김, 재요청 시 중복 없음
- [ ] archive_list → 내 것만
- [ ] read 전용 토큰으론 forbidden

## 6. 커밋
브랜치 `agent/423-mcp-archive` → 커밋·푸시 → 재현검증 → "커밋해" → 머지.
스테이징: `src/lib/mcp/scopes.ts` · `src/lib/mcp/tools/archive.ts`(신규) · `app/api/mcp/route.ts` · (필요시 admin/mcp-tokens 발급 UI) · 이 지시서
제외: 상시 목록(topic-covers NFD·council-bridge·성능-리전이동·골드샘플).
커밋: `feat: MCP 아카이브 write+list(content_archive·archive_list) + archive 스코프 (423)`

### 기록란 (구현자)
| 항목 | 결과 |
|---|---|
| archive 스코프 추가 + 발급 UI 노출 | |
| 모든 쿼리 actor.userId 스코프(타인 접근 차단) | |
| 발행 콘텐츠만 아카이브 | |
| 중복 방지 | |
| 도구명 중복 없음 | |

## 7. 다음·비고
- **비고(디렉터 확인)**: 아카이브는 **토큰 계정 단위**. Teams 개인별 아카이브가 필요하면 Teams user→인사이트아웃 계정 매핑이 선행(후속 슬라이스).
- 메일/Teams 전달: PA가 `archive_list`를 읽어 처리(기존 브라우저 메일 라우트는 그대로).
- 다음: 424 보고서 생성 트리거.
