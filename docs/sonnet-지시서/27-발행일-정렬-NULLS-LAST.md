# 지시서 27 — 발행일 정렬 NULLS LAST (요즘IT 상단 고정 버그)

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Codex) · 검증: Opus · 커밋: 구현 에이전트
> 증상: 뉴스 목록·최근 피드에서 **요즘IT가 항상 최상단**. 원인 확정: 요즘IT 28건 전부 `published_at=NULL` → Postgres `order by published_at desc`는 **NULLS FIRST(기본)** 라 null 행이 맨 앞에 고정.
> ⚠️ 작업 전 해당 쿼리들·`src/lib/supabase/client.ts` 를 읽을 것. 스키마 변경 없음.

## 1. 정렬 NULLS LAST (코드)
아래 **사용자 노출 목록의 `published_at` 내림차순** 정렬에 `nullsFirst: false` 추가:
`.order('published_at', { ascending: false, nullsFirst: false })`

대상:
- `src/app/dashboard/contents/page.tsx:305` (뉴스/콘텐츠 목록 — 핵심)
- `src/components/dashboard/RecentFeed.tsx:102` (홈 최근 피드)
- `src/app/dashboard/search/page.tsx:171` (검색)
- `src/app/admin/newsletter/actions.ts:103` · `src/lib/newsletter/dispatch.ts:85` (뉴스레터 선별)
- `src/app/dashboard/youtube/page.tsx:110` · `src/components/dashboard/YoutubeSection.tsx:49` (유튜브 — 일관성, 영상은 보통 발행일 있음)

> `created_at`/`collected_at`/`finished_at`/`updated_at` 정렬은 not-null 컬럼이라 **대상 아님**(건드리지 말 것).
> 발행일 없는 레거시 행은 NULLS LAST 로 하단에 "발행일 미상"으로 표시됨(정상).

## 2. 요즘IT 데이터 (운영 — David/수희, 코드 아님 · 보고에 안내만)
- 요즘IT 28건 null = #23 이전 레거시. 요즘IT 피드는 발행일이 없어 **#23 정책상 신규 수집 0** → 사실상 죽은 소스 + 본문 정크(이전 보일러플레이트도 요즘IT).
- 권장: `/admin/sources` 에서 **요즘IT 비활성**. (선택) 레거시 null행 정리는 별도 SQL — 이번 코드 범위 아님, David 판단.

## 건드리지 말 것
- not-null 컬럼 정렬·크롤러·스키마·RLS·dedup 불변. 정렬 옵션만 추가.

## 완료 조건
- [ ] 위 6개 `published_at` desc 정렬에 `nullsFirst: false` 적용
- [ ] not-null 컬럼 정렬·크롤러/스키마/RLS 불변
- [ ] `npx tsc --noEmit` · `npm run build` · `npm run lint`(신규 0) 통과
- [ ] (점검) 뉴스 목록 상단이 발행일 최신순, 발행일 없는 요즘IT는 하단

## 보고 양식
```
## 완료 보고 — 지시서 27 발행일 정렬 NULLS LAST
- 변경 파일: <목록>
- 한 일: published_at desc 정렬 NULLS LAST 적용(6개소)
- 운영 안내: 요즘IT 비활성 권장(발행일 없는 죽은 소스)
- 검증: tsc · build · lint
- 미해결: <없으면 "없음">
```
