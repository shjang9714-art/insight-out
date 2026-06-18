# 지시서 97 — company-scope 인사이트 카드 (워치리스트 업체별 LLM 동향)

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Claude Code) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전 다음을 읽을 것: `AGENTS.md` · `src/lib/insight/generate.ts`(산업 카드 엔진 — 이 파일에 회사 엔진 추가, 헬퍼 재사용) · `src/app/api/admin/insights/route.ts`(POST 확장) · `src/app/admin/insights/page.tsx`(생성 트리거 UX) · `src/app/dashboard/ai-analysis/page.tsx`(93 "내 관심업체 동향" 섹션에 브리핑 얹기) · `supabase/schema.sql`(insight_cards 1055~ · `scope` · unique(period_start,scope,topic) · RLS) · `src/lib/types.ts`(InsightCard).
> **신규 SQL 없음.** `insight_cards.scope` 컬럼·인덱스·RLS 이미 존재(89). 코드만.

---

## 배경 (David)

AI 분석 ① — 워치리스트(93) **업체별 LLM 동향 카드**. 산업 전체 카드(89, scope='industry') 위에, 담당자가 추적하는 **개별 업체의 최근 핵심 동향 1줄 + LGU+ 시사점**을 카드로. 93의 "내 관심업체 동향"(원문 기사 나열) 위에 **AI 브리핑**을 얹는 그림.

## 설계 결정 (Opus, 확정 — 임의 변경 금지)

1. **카드는 글로벌(공유), 표시는 사용자별 필터.** `insight_cards` 는 `user_id` 없음(전역). 회사 카드는 `scope='company'`, `topic=회사명`. **생성 대상 = 전체 사용자 `user_watchlist.company` 합집합**(대소문자 무시 dedup), **인기순(추적 사용자 수)·기사량으로 정렬해 상한(maxCompanies)까지**. → LLM 비용을 사용자 수가 아닌 **고유 회사 수**로 한정. 사용자는 AI 분석에서 **본인 워치리스트 회사 카드만** 봄.
2. **기사 매칭 = ILIKE(title/summary_ko)** — 93 "내 관심업체 동향"과 동일(워치리스트는 자유 입력이라 키워드 카탈로그 보장 X). 회사당 최소 기사 수(minArticles) 미만이면 카드 생성 skip.
3. **표시 = 기존 "내 관심업체 동향" 섹션 강화.** 별도 섹션 신설 X. 회사 카드 있으면 그 회사 카드 안에 headline·시사점을 기사 링크 위에 노출.
4. **신규 SQL 없음. 어드민 온디맨드 트리거**(LLM 키 부족 → David 통제). 산업 카드 경로 무변경.

---

## 작업

### 1. 회사 카드 엔진 — `src/lib/insight/generate.ts` (기존 파일에 추가)
- 기존 헬퍼 재사용: `parseLlmOutput`, `kstDateString`, `kstDateToUtcIso`, `llmComplete`.
- 신규 export:
  ```ts
  export async function generateCompanyInsightCards(
    adminClient: SupabaseClient,
    opts?: { days?: number; maxCompanies?: number; articlesPerCompany?: number; minArticles?: number },
  ): Promise<{ created: number; companies: string[] }>
  ```
- 기본값: `days=7`, `maxCompanies=15`(상한 30), `articlesPerCompany=8`, `minArticles=2`.
- 절차:
  1. **회사 목록**: `user_watchlist` 에서 `company` 전체 조회(admin 클라이언트=RLS 우회). JS 에서 `lower(company)` 기준 dedup + 추적 사용자 수 카운트 → **count desc** 정렬 → 상위 `maxCompanies`. (원본 표기 1개 보존해 topic 으로 사용.) 0건이면 `{created:0, companies:[]}`.
  2. **기간**: `periodEnd=kstDateString(0)`, `periodStart=kstDateString(days-1)`, `sinceIso=kstDateToUtcIso(periodStart)`.
  3. **회사별 기사**(순차 루프): `contents` `status='published'`, `collected_at>=sinceIso`, **`.or('title.ilike.%{esc}%,summary_ko.ilike.%{esc}%')`**(`%_\\` 이스케이프), select `id,title,summary_ko,cluster_id,importance_score,collected_at`, 정렬은 산업 엔진과 동일(클러스터 대표 우선 → importance desc), `limit articlesPerCompany`.
     - 기사 수 `< minArticles` → 그 회사 skip.
  4. **LLM 생성**: `llmComplete('report', COMPANY_SYSTEM_PROMPT, buildCompanyUserPrompt(company, articles))`.
     - `COMPANY_SYSTEM_PROMPT`: "당신은 LG U+ B2B 시장 인텔리전스 분석가다. 주어진 한 기업 관련 기사들로 그 기업의 **최근 핵심 동향 1줄(headline)** 과 **LG U+ B2B 관점 시사점 1~2줄(implication, 경쟁/협력/위협)** 을 쓰라. 근거 없는 주장 금지 — 각 핵심 주장은 입력 기사의 15단어 이내 인용과 content_id 를 citations 로. JSON만 출력: {\"headline\":\"\",\"implication\":\"\",\"citations\":[{\"content_id\":\"\",\"quote\":\"\"}]}"
     - user: `기업: ${company}\n\n` + 기사들 `[${id}] ${title}\n${summary_ko ?? ''}`.
  5. `parseLlmOutput` → null 이면 skip. citation `content_id` 를 그 회사 기사 id 집합으로 검증(환각 차단).
  6. **upsert** `insight_cards`: `{ period_start, period_end, scope:'company', topic:company, headline, implication||null, source_content_ids:기사id들, citations:validCitations, status:'draft', generated_at }`, `onConflict:'period_start,scope,topic'`. (산업 엔진과 동일 멱등.)
  7. `created` 누적, `companies` 반환.
- 산업 엔진 코드 구조(클러스터 정렬·citation 검증·try/catch per-company·console 로그)를 그대로 미러.

### 2. 어드민 POST 확장 — `src/app/api/admin/insights/route.ts`
- 기존 `POST` body 파싱에 `scope?: 'industry' | 'company'`(기본 `'industry'`), `maxCompanies?` 추가.
- 분기: `scope==='company'` → `generateCompanyInsightCards(admin, { days, maxCompanies })` → `{ created, topics: companies }`(UI 호환 위해 `topics` 키로 회사명 반환). 그 외 기존 `generateIndustryInsightCards`.
- GET/[id] 무변경(회사 카드도 목록·발행·삭제에 자동 포함 — GET 은 scope 무관 select).

### 3. 어드민 트리거 버튼 — `src/app/admin/insights/page.tsx`
- 기존 "인사이트 생성"(산업) 옆/아래에 **"관심업체 동향 생성"** 버튼.
- 클릭 → `fetch('/api/admin/insights', { method:'POST', body: JSON.stringify({ scope:'company' }) })` → 결과 `created`·`topics`(회사명) 표시(기존 handleGenerate 패턴 미러, 별도 state). 로딩·에러 처리.
- (선택) 카드 목록 행에 `scope` 배지("산업"/"관심업체") 표시하면 구분 쉬움 — 여력 시.

### 4. AI 분석 — "내 관심업체 동향" 강화 — `src/app/dashboard/ai-analysis/page.tsx`
- 워치리스트 회사명 확보 후(기존 `watchlist`), **회사 카드 조회**(워치리스트 있을 때만):
  - `insight_cards` `scope='company'`, `status='published'`, `order period_start desc, generated_at desc`, `limit ~60`(최근 회사 카드). **`.in('topic', ...)` 로 정확 매칭하지 말 것**(대소문자 불일치 위험 — topic 은 생성 시점 어떤 사용자의 원본 표기라 본인 표기와 다를 수 있음).
  - JS 에서 `lower(topic)` 기준으로 본인 워치리스트(`lower(company)`)와 매칭, 회사별 **최신 1장**만 채택(`Map<lowerCompany, card>`).
- 기존 `watchResults` 카드 렌더에서, 그 회사 카드가 있으면 **기사 링크 위에** 브리핑 블록:
  - headline(굵게) + (있으면) "시사점" 라벨 + implication. (89/산업 카드 톤 미러: brand 토큰·`text-sm`.)
  - 카드 없으면 기존처럼 기사 링크만(graceful).
- 빈 상태/없음 처리 기존 유지.

## 회귀 / 주의
- **신규 SQL 없음** — `insight_cards.scope` 존재. 회사 카드는 RLS상 인증 사용자가 published 조회 가능(scope 무관).
- 회사 카드 **글로벌 공유** — 한 사용자가 워치하는 회사 카드는 같은 회사를 워치하는 모두에게 재사용(중복 생성 X, period+scope+topic 멱등).
- 생성은 **전체 워치리스트 합집합**이라 회사가 많아질 수 있음 → `maxCompanies` 캡·인기순 정렬로 LLM 비용 제한. 키 부족 시 일부만 생성됨(graceful, llm_settings 한도 자동 적용).
- ILIKE 근사 매칭(93과 동일 한계) — 짧은 회사명 오탐 가능. 1차 허용, 정밀 매칭 후속.
- 카드는 `status='draft'` 로 생성 → 어드민이 발행해야 사용자 노출(89 흐름 동일).
- UI 한국어(#1)·색 토큰(#9)·서버 컴포넌트 유지(AI 분석)·트리거 버튼만 leaf `'use client'`(기존 어드민 페이지가 이미 client).
- `any` 금지(#TS). 회사 카드 조회 결과는 `InsightCard`/부분 타입으로.

## 완료 조건
- [ ] `generateCompanyInsightCards()` (합집합·인기순·ILIKE·minArticles·citation 검증·멱등 upsert)
- [ ] POST `/api/admin/insights` scope 분기(company → 회사 엔진)
- [ ] 어드민 "관심업체 동향 생성" 버튼 + 결과 표시
- [ ] AI 분석 "내 관심업체 동향"에 회사 카드 브리핑(headline·시사점) 얹기 + graceful
- [ ] `npx tsc --noEmit` · `npm run build` · `npm run lint`(신규 0) 통과
- [ ] 육안: 워치리스트 회사 등록 → 어드민 회사 카드 생성 → 발행 → AI 분석 그 회사 카드에 브리핑 노출

## 보고 양식
```
## 완료 보고 — 지시서 97 company-scope 인사이트 카드
- SQL: 없음(scope 기존)
- 변경: lib/insight/generate.ts(회사 엔진), api/admin/insights/route.ts(scope 분기), admin/insights/page.tsx(트리거+배지), ai-analysis/page.tsx(관심업체 브리핑)
- 글로벌 카드 + 워치리스트 필터 · 합집합 인기순 캡 · ILIKE 매칭 · draft→발행 · 멱등
- 검증: tsc · build · lint(신규 0) · 육안
- 미해결: 정밀 매칭(단어경계) · 회사 카드 자동 스케줄(후속) · 논조(96) 결합 표시(후속)
```

---

### 메모(후속)
- **논조(96) 결합**: 회사 카드에 그 회사 기사 논조 분포(긍/중/부) 함께 표시 가능 — 96 sentiment 재사용.
- **자동 스케줄**: 회사 카드 주간 자동 생성(크론) — 키 여유 시.
- 정밀 매칭(단어 경계·별칭 사전) — 93/94/96 공통 후속.
- 관련: 89(인사이트 엔진)·90(AI 분석)·93(워치리스트)·96(논조).
