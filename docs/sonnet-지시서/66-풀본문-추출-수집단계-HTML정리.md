# 지시서 66 — 풀본문 추출을 수집 단계로 + 본문 HTML 정리(저장 시) + Google News URL 해소

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Claude Code) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전 `AGENTS.md` + `src/lib/crawler/orchestrator.ts`(processCrawlItem·runCrawl·budget 패턴) + `src/lib/crawler/adapters/news-site.ts`(본문 추출) + `src/lib/contents/full-body.ts`(`ensureFullBody`) + `src/lib/contents/clean-body.ts`(`cleanBodyText`·`htmlToPlainText`·`decodeEntities`) + `src/lib/crawler/summarize.ts`(62) 를 읽을 것. `npm install` 먼저.
> **DB 변경 없음**(`body_original`·`body_fetched_at` 기존 컬럼 사용). **신규 의존성 없음**(`@extractus/article-extractor` 이미 설치). 단독 커밋 가능.

---

## 배경

카드/피드에 기사 전문이 안 보이고 `&nbsp;&nbsp;` 같은 텍스트가 노출되는 두 문제의 원인:
1. **풀본문 추출이 상세 조회 시에만 lazy 실행**(`ensureFullBody`, `/api/contents/[id]/body`). 카드·피드·목록은 `summary_ko ?? body_original`(=RSS 스니펫)만 표시 → "제목 반복"처럼 보임. 요약(62)·관련도(64) 입력도 빈약한 스니펫.
2. **HTML 정리(`cleanBodyText`)가 표시 시점**이라 일부 경로(카드 등)에서 누락 → 저장된 스니펫의 `&nbsp;`·태그가 그대로 노출.
3. **Google News 키워드 검색 수집물**은 `original_url` 이 `news.google.com` 리다이렉트라 추출기가 원문에 도달 못 함 → 상세에서도 전문 실패.

→ 기존 자산(`ensureFullBody`·`clean-body`)을 **수집 단계로 끌어올리고**, **저장 시 본문을 정리**하고, **Google News URL 을 실제 원문으로 해소**한다.

### 설계 결정(Opus)
1. **저장 시 정리(핫패스, 즉효)**: 어댑터에서 본문을 `cleanBodyText(htmlToPlainText(body))` 로 정리해 저장 → 모든 표시 경로에서 `&nbsp;`/태그 사라짐 + 요약·분류 입력도 깨끗. (가장 작고 즉각적인 fix.)
2. **수집 후 enrichment 단계(best-effort tail)**: 메인 크롤·로그 적재가 **끝난 뒤** 신규 적재분 일부를 풀본문 추출. budget + per-item 6초 타임아웃으로 묶고, **실패/타임아웃이어도 크롤 결과는 보존**(스니펫 유지, lazy 추출 폴백 여전히 동작).
3. **추출 성공분은 요약 재생성**(62 `summarizeKo`)으로 풀본문 기반 요약 갱신. (관련도 재판정(64) 재실행은 이번 범위 밖 — 후속.)
4. **Google News URL 해소**: `news.google.com` 링크는 최종 원문 URL 로 해소 후 추출 시도. 실패 시 graceful skip.
5. **신규 SQL·의존성 없음**: body_original/body_fetched_at 존재, article-extractor 설치됨. canonical_url 영구 저장은 후속(C-2).

## 작업

### 1. 저장 시 본문 정리 — `adapters/news-site.ts`
- `import { cleanBodyText, htmlToPlainText } from '@/lib/contents/clean-body'`.
- body 구성 부(현 `const body = item.content ?? item.contentSnippet ?? ''`) 뒤에 **정리 적용**: `const cleanBody = body ? cleanBodyText(htmlToPlainText(body)) : ''`. RawItem.body 에 `cleanBody || undefined` 저장. `detectLanguage` 입력도 cleanBody 사용.
- (효과: `&nbsp;` 등 즉시 제거. 풀본문 추출 전에도 스니펫이 깔끔.)

### 2. Google News URL 해소 — `src/lib/crawler/resolve-url.ts`(신규)
- `resolveArticleUrl(url: string): Promise<string>`
  - host 가 `news.google.com` 이 아니면 그대로 반환.
  - 맞으면 최종 원문 해소 시도: `fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(5000) })` 후 `res.url`(최종 리다이렉트 URL)이 google 도메인이 아니면 그것 반환. (가능하면 RSS guid/링크의 base64 디코드 등 보조 시도 추가 가능하나, 실패 시 원본 url 반환.)
  - 모든 실패 → 원본 url 반환(throw 금지).
- 'server-only'.

### 3. enrichment 단계 — orchestrator
- 상수: `MAX_ENRICH_PER_CRAWL`(예 15), 본문 부족 기준 `ENRICH_MIN_BODY_LEN`(예 400 — 이보다 짧으면 추출 시도).
- 신규 함수 `enrichRecentContents(admin, since, summarizeBudget)`:
  - 대상 조회: `contents` 에서 `body_fetched_at is null` AND `original_url not null` AND `collected_at >= 이번 런 시작(since 또는 runStartedAt)` 인 행을 `MAX_ENRICH_PER_CRAWL` 만큼(최신순) select(id, original_url, body_original, title, status, summary_ko, original_language, body_translated_ko, body_fetched_at 등 ensureFullBody/요약에 필요한 필드).
  - 각 항목:
    1. `const resolved = await resolveArticleUrl(row.original_url)` — google news 해소.
    2. 추출: 기존 **`ensureFullBody`** 재사용하되 해소된 URL 을 쓰도록. (ensureFullBody 가 content.original_url 을 쓰므로, **resolved URL 을 받는 옵션 인자 추가** 또는 enrichment 전용 추출 함수로 분리 — 둘 중 간단한 쪽. 핵심: extract(resolved) → cleanBodyText → 길이 개선 시 body_original 갱신 + body_fetched_at=now, 실패해도 body_fetched_at=now 로 재시도 방지.)
    3. 본문이 실제로 보강됐고(`published` 상태 & 새 본문 길이 ≥ SUMMARY_MIN_BODY_LEN) `summarizeBudget.remaining > 0` 이면 → `summarizeKo(title, 새본문)` 로 **summary_ko 재생성·update**(62 미러, try/catch 격리, 시도 시 budget 차감).
  - 전부 try/catch 격리 — enrichment 실패가 크롤 결과·다른 항목을 깨지 않게.
- **runCrawl 통합 위치**: 결과 집계·`return` **직전**(메인 수집·crawl_log·키워드/유튜브 단계가 모두 끝난 뒤). `options.sourceIds` 개별 수집 시에도 실행 가능(개별 수집물도 enrich 대상). `summarizeBudget` 는 기존 것 재사용(요약 예산 공유).
- ⚠️ 서버리스 타임아웃: `MAX_ENRICH_PER_CRAWL` × 6초 + 요약이 cron `maxDuration` 내에 들도록 budget 보수적. enrichment 는 **tail**이므로 초과 시에도 이미 적재·로그된 수집물은 안전.

### 4. (확인) 표시 경로
- 카드/피드/목록이 `body_original`(이제 정리됨)·`summary_ko`(이제 풀본문 기반)를 쓰므로 자동 개선. 추가 표시 변경 불필요. (이미 `cleanBodyText` 쓰는 상세는 그대로.)

## 회귀 / 주의
- DB/의존성 무변경. 메인 크롤·중복제거·게이트·요약(62)·분류(64)·유튜브·키워드검색 모두 불변.
- enrichment 는 **신규 적재분 일부(budget)만** + 6초 타임아웃 → 점진 보강. 못 미친 건 기존 lazy(상세) 추출이 폴백.
- `ensureFullBody` 가 lazy(상세)에서도 계속 동작해야 함 — enrichment 와 충돌 없게(둘 다 body_fetched_at 마커로 멱등).
- Google News 해소 실패는 흔할 수 있음 → graceful(원본 url 폴백), 절대 throw/크롤 중단 금지.
- fetch 외부 호출: Vercel allowlist·차단(403)·로봇 대응 — 실패 격리. (대량·고신뢰 추출은 후속 별도 워커.)
- UI/주석 한국어(#1).

## 완료 조건
- [ ] `news-site.ts`: 저장 전 `cleanBodyText(htmlToPlainText(body))` 적용(`&nbsp;` 제거)
- [ ] `resolve-url.ts`: `resolveArticleUrl`(google news 리다이렉트 해소, graceful)
- [ ] orchestrator `enrichRecentContents`: 신규분 budget·타임아웃 추출 → body_original 갱신 + 성공분 요약 재생성, runCrawl tail 통합
- [ ] `npx tsc --noEmit` · `npm run build` · `npm run lint`(신규 0) 통과
- [ ] 육안: "지금 수집" → 신규 뉴스 카드에 정리된 본문/풀본문 기반 요약, `&nbsp;` 사라짐 / 추출 실패분도 에러 없이 스니펫 유지

## 보고 양식
```
## 완료 보고 — 지시서 66 풀본문 추출 수집단계화 + HTML 정리
- 변경 파일: <목록>
- news-site 저장정리 / resolve-url(google news 해소) / enrichRecentContents(budget·타임아웃·요약재생성)·runCrawl tail
- 신규 SQL·의존성 없음 · graceful(추출 실패·타임아웃 격리) 확인
- 검증: tsc · build · lint(신규 0)
- 미해결: 대량 추출 워커·canonical_url 영구저장·풀본문 기반 관련도 재판정(64)은 후속
```

---

### 메모(후속)
- 추출 성공률·속도 한계 시 → 별도 enrichment 크론/워커로 분리(서버리스 타임아웃 회피).
- canonical_url 컬럼 영구 저장(C-2, 신규 SQL) → dedup·재추출 안정화.
- 풀본문 확보 후 64 관련도 재판정 재실행(품질 추가 향상).
- 관련: [[insight-out-뉴스수집-개선-로드맵]]
