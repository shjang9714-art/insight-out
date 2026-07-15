# 지시서 362 — COUNCIL 현재 맥락 seed(진입점 + set-context push)

> 대상: 구현 에이전트 · **insight-out 레인** · 선행: 361(임베드)·363(티켓, 머지됨) · **신규 SQL 없음**
> ⚠️ 읽을 것: `src/components/dashboard/CouncilWorkspace.tsx`(`sendContext`=set-context `{concern, note, sources}`·`pendingConcern`/`pendingContext`=URL `?topic/?concern/?context`·`ready` 분기) · `src/app/dashboard/council/page.tsx`(진입 페이지) · `src/app/dashboard/contents/[id]/page.tsx`(콘텐츠 상세) · `src/app/dashboard/entities/[id]/page.tsx`(엔티티 상세) · `src/lib/contents/citations.ts`(관련 자료 조회 패턴) · `AGENTS.md`

## 배경 (David)
COUNCIL(AI 협의체)은 지금 빈 주제로 열린다. 사용자가 **콘텐츠·기업 상세를 보다가 "이 주제로 토론"을 누르면 그 맥락(제목·요약·관련 근거)이 자동으로 council 토론에 seed** 되게 한다. 371(브릿지 pull)이 council 의 **광역 주제 역제안**을 채운다면, 362(push)는 **사용자가 지금 보는 특정 항목**을 토론 출발점으로 밀어넣는다(상호보완). set-context 인프라(`sendContext`)는 361 에서 이미 있고 `sources` 필드도 계약에 있으나 **채워 보내는 진입점이 없다** — 그걸 만든다.

## 작업

### 1. 진입점 — "이 주제로 토론(COUNCIL)" 버튼
- **콘텐츠 상세**(`contents/[id]`)와 **엔티티 상세**(`entities/[id]`)에 버튼 추가. 클릭 시 COUNCIL 진입 페이지로 이동하며 현재 항목의 맥락을 전달한다.
- 전달 방식: `/dashboard/council?topic=<제목>&context=<요약>&ref=<contents|entities>&refId=<id>` (URL 인코딩). 요약은 길이 상한(예: 500자)으로 자른다. **원문·민감정보 URL 노출 금지**(제목·요약·id 만).
- AI 산출물 아님 → AiMark 부착 금지. 색 토큰·한국어 문구·`prefetch={false}`.

### 2. CouncilWorkspace — 맥락 번들 구성 후 push
- `pendingConcern`(topic)·`pendingContext`(context)에 더해 **`ref`/`refId` 를 읽어** 관련 근거를 조립한다.
  - `refId` 있으면 경량 조회로 **관련 자료 상위 N(3~5건)** 을 모은다: 콘텐츠면 해당 콘텐츠 + 같은 키워드/엔티티 관련 기사, 엔티티면 그 엔티티 관련 최근 콘텐츠. (`citations.ts`/기존 관련조회 패턴 재사용, 서버 라우트가 필요하면 `verify"세션"` 후 read.)
  - 이를 `sources: EmbedSource[]`(`{ title, url? }`)로 매핑.
- `ready` 분기에서 기존 `sendContext(pendingConcern, pendingContext)` 를 **`sendContext(concern, note, sources)`** 로 확장 — concern=제목, note=요약, sources=관련 근거. 티켓 push(`pushTicket`)와 나란히(순서 무관, 충돌 없음).
- refId 없거나 조회 실패 시 **기존처럼 concern/note 만** push(그레이스풀, 사용자 흐름 안 끊김).

## 회귀 / 주의
- set-context `targetOrigin` 은 반드시 `councilOrigin()`(‘*’ 금지, 361 유지).
- 관련 근거 조회는 **published 만**·상한 가드·세션/RLS 존중. 실패는 조용히 폴백.
- 361(임베드)·363(티켓) 로직 회귀 금지 — `ready` 분기에 push 만 얹는다.
- URL 파라미터에 개인정보·원문 본문 넣지 말 것(제목·요약·id 만).
- 검증: `tsc`·ESLint·`check-prefetch`·`build` + (dev)콘텐츠/엔티티 상세에서 "이 주제로 토론" → council 열리고 제목·요약·관련 근거가 set-context 로 전달(콘솔/네트워크로 postMessage 확인) + refId 없이 열어도 정상.

## 배포 게이트
⚠️ main 머지·배포 금지. **전용 worktree**(`git worktree add /private/tmp/insight-out-362 -b agent/362-council-context-push origin/main`)에서 작업 → push+PR, 브랜치명 회신 → Opus 검증 후 머지.

## 쪼개기
① 진입점 버튼(콘텐츠·엔티티 상세) / ② CouncilWorkspace 번들 조립 + sources push. 2커밋.
