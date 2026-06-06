# 지시서 18 — 콘텐츠 관리(#37) + 어드민 레이아웃(#36) + 실패 피드 RSS 정리

> 작성: Opus(Cowork) · 대상: **구현 에이전트(Codex 등)** · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전 `AGENTS.md` + `src/app/admin/layout.tsx`·`src/components/admin/SourceManager.tsx`·`KeywordManager.tsx`(어드민 CRUD 패턴)·`src/app/dashboard/contents/page.tsx`(목록 조회)·`src/lib/types.ts`(`Content`,`ContentStatus`) 를 읽을 것. 먼저 `npm install`.
> 3개 파트는 **독립적**으로 구현·검증 가능. 공통 원칙: 브라우저 `createClient()` + admin RLS(service_role 금지), `/admin/*` 는 proxy.ts 가드, 한국어 UI, AGENTS §9 토큰, 크롤러/스키마/RLS 불변.

## 파트 A — 콘텐츠 관리 페이지 (#37) `/admin/contents`
수집된 `contents` 를 관리자가 관리.
- `src/app/admin/contents/page.tsx` + 클라이언트 컴포넌트(`AdminContentManager`).
- **목록**: `contents` 조회(최근순, 페이지네이션 또는 limit 100). 컬럼: 제목·카테고리·소스명(`sources(name)`)·상태(`status`)·수집일(KST). 필터: 카테고리·상태(`published/pending/rejected`), 제목 검색(선택).
- **액션**(admin RLS 로 update/delete 통과):
  - **상태 변경**: `pending`(보류) → `published`(승인) / `rejected`(반려) 버튼. → `contents.status` update. (#13 품질 보류 큐를 여기서 처리)
  - **삭제**: 확인 후 delete.
  - (선택) 제목·editor_pick 토글 수정.
- 상태 배지(녹/노/빨), 빈 상태, 로딩·한국어 에러. 어드민 내비에 "콘텐츠 관리" 링크 추가.

## 파트 B — 어드민 대시보드/홈 (#36) `/admin`
- `src/app/admin/page.tsx`(서버 컴포넌트): 어드민 기능 **메뉴 카드**(콘텐츠 관리·소스 관리·키워드 관리·크롤링 현황·리포트 업로드) + 간단 지표(총 콘텐츠 수, 오늘 수집 수, 활성 소스 수, pending 수) 조회·표시. PRD 6.1 어드민 구조.
- `/admin` 진입 시 이 홈이 보이게(현재 `/admin` 가 비었거나 redirect면 정리).

## 파트 C — 실패 피드 정상 RSS 정리
현재 수집 실패 소스: **과학기술정보통신부 · 디지털데일리 · ITWorld Korea · SKT · Fierce Network**(404/형식오류).
- 각 매체의 **정상 RSS 피드 URL 을 웹 검색 + fetch 로 검증**(200 + 유효 RSS/Atom XML + 최근 글 포함 확인).
- 산출물: `supabase/2026-06-06-소스-RSS교체.sql` — 검증된 곳은 `update public.sources set rss_url='<검증된URL>', is_active=true where name='<이름>';`, RSS 없는 곳은 `update ... set is_active=false where name='<이름>';`(주석에 사유). 멱등.
- 보고에 매체별 결과 명시(이 URL로 교체 / RSS 없어 비활성). **SQL 핸드오프**라 수희가 실행하므로 이 파일은 먼저 커밋·푸시 가능.

## 완료 조건
- [ ] A: `/admin/contents` 목록·필터·상태변경(승인/반려)·삭제, 내비 링크
- [ ] B: `/admin` 홈 메뉴 카드 + 지표
- [ ] C: 5개 매체 RSS 검증 → `2026-06-06-소스-RSS교체.sql`(교체/비활성) + 매체별 결과 보고
- [ ] service_role 미사용, 크롤러/스키마/RLS 불변
- [ ] `npm install && npx tsc --noEmit && npm run build && npm run lint`(신규 0) 통과

## 보고 양식
```
## 완료 보고 — 지시서 18
- 변경 파일: <목록>
- A 콘텐츠관리 / B 어드민홈 / C RSS: <각 요약>
- C 매체별 결과: <과기정통부=…, 디지털데일리=…, ITWorld=…, SKT=…, Fierce=…>
- 검증: tsc · build · lint
- 미해결: <없으면 "없음">
```
> 작업계획서 미등재(#37·#36은 등재, 콘텐츠관리/어드민홈/RSS) → 묶음 머지 후 기록 동기화 1회로 반영.
