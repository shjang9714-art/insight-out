# 지시서 371 — COUNCIL 브릿지 소스 확장 (insights·reports·competitor·keywords)

> 대상: 구현 에이전트 · **insight-out 레인** · **신규 SQL 없음** · council 쪽은 이미 소비 준비 완료(전방호환·빈배열 폴백)
> ⚠️ 읽을 것: `src/app/api/council/route.ts`(기존 `search`·`content`·`issues`·`entities` 분기 — 같은 Bearer `io_` read 토큰·`{ items }` 계약) · `src/lib/reports/generate-strategy.ts`(ai_reports 컬럼 title·summary) · `src/lib/competitor-weekly/*`·`competitor_weekly_reports`(summary=한줄제목·week_start/end·status·overall_impact) · `src/lib/issues/trending.ts`·`trending_keywords` 뷰 · `src/middleware.ts`(`/api/council` 이미 publicPaths) · `AGENTS.md`

## 배경
council 이 `/api/council?resource=<X>` 로 MI 를 당겨 **토론 주제 역제안(TopicSuggestions)** 을 풍부하게 한다. 현재 브릿지는 `search`·`content`·`issues`·`entities`만 지원 → council `fetchMiBundle` 이 추가 호출하는 4개(`insights`·`reports`·`competitor`·`keywords`)가 404→빈배열로 처리됨. 이 4개를 추가한다. **인증·형식 기존과 동일**(Bearer `io_` read 토큰, `{ resource, count, items }`).

## 작업 — `src/app/api/council/route.ts` 에 분기 4개 추가

기존 `if (resource === 'entities') { … }` **뒤에** 추가. council 이 읽는 **응답 키는 고정**(아래) — 컬럼명이 다르면 **매핑에서만** 맞춘다. 각 분기 DB 오류는 기존 `jsonError(500, …)` 패턴, admin 클라이언트 재사용.

### `resource=insights` — 핵심 인사이트 (`daily_insights`)
- `select('id, headline, summary_ko, created_at')` · `.eq('status','published')` · `order(created_at desc)` · `limit(min(q.limit ?? 6, 20))`. `q` 있으면 `.ilike('headline', %q%)`.
- 매핑: **`{ headline, summary: summary_ko ?? null }`**.

### `resource=reports` — AI 리포트 (`ai_reports`)
- **발행분만**(`published_at IS NOT NULL` 또는 status 발행값 — 실제 스키마 확인). `select('title, summary, published_at')` · 최신순 · limit(min N, 20).
- 매핑: **`{ title, summary: summary ?? null }`**.

### `resource=competitor` — 경쟁사 주간 (`competitor_weekly_reports`)
- `.eq('status','published')` · 최신 `week_start desc` · limit(min N, 10). `summary`가 한 줄 제목 역할(frame-spec).
- 매핑: **`{ title: summary ?? `${week_start}~${week_end}`, summary: summary ?? null }`** (council 은 `{title, summary}` 읽음).

### `resource=keywords` — 트렌딩 키워드 (`trending_keywords` 뷰)
- 트렌딩 키워드 상위 N(뷰/집계 재사용, `trending.ts` 참고). 세션 비의존.
- 매핑: **`{ name, trend? }`** — 증가율/▲▼ 있으면 `trend` 채우고 없으면 생략.

> **council 이 읽는 키는 위 고정**(`headline`/`summary`, `title`/`summary`, `name`/`trend`). 나머지는 무시되니 과供 금지.

## 회귀 / 주의
- **미들웨어 손대지 말 것**(`/api/council` 이미 publicPaths, route 가 Bearer 자체검증). 토큰 없으면 401(JSON), 잘못된 토큰 401, read 스코프 없으면 403 — 기존 패턴 그대로.
- 공개/발행 상태 필터 필수(비공개·검토중 노출 금지). limit 상한 가드.
- 신규 SQL 없음(전부 기존 테이블/뷰 조회). 뷰(`trending_keywords`) 미존재(42P01)면 graceful 빈배열.
- 검증: `tsc`·ESLint·`check-prefetch`·`build` + 토큰으로 4개 resource 응답 형태 확인:
  - `?resource=insights` → `{ items:[{headline,summary},…] }`
  - `?resource=reports` → `{ items:[{title,summary},…] }`
  - `?resource=competitor` → `{ items:[{title,summary},…] }`
  - `?resource=keywords` → `{ items:[{name,trend?},…] }`
  - 토큰 없으면 401(리다이렉트 아님).

## 배포 게이트
⚠️ main 머지·배포 금지. **origin/main에서 브랜치 먼저**(`agent/371-council-bridge-sources`) → push+PR, 브랜치명 회신 → Opus 검증 후 머지.

## 쪼개기
단일 파일 4분기 → **1커밋**.
