# 지시서 432 — GDELT BigQuery 과거 6개월 백필 (Phase 2)

> 작성: 플래너(Opus) · 2026-07-25 · `GDELT-통합수집-설계-2026-07-25.md` (B)
> 선행: **수희 GCP 서비스계정 키(BigQuery) 발급 후 반영.** (env 없으면 graceful skip — 코드·재현검증은 지금 가능)
> 협업 루프: 검증용 브랜치 `agent/432-gdelt-bigquery`(from `origin/main`) → 재현검증 → "커밋해" → 머지.
> 번호: 432 · git author David(yjhead@gmail.com) · **SQL 0.** (커서 테이블 없음 — dedup 멱등)

---

## 0. 한 줄
GDELT `gkg_partitioned` 를 **월 단위·컬럼 프루닝·바이트 상한**으로 조회해 **과거 6개월(2026-01~) 한국 기사 URL** 을 발견 → 기존 파이프라인(stub → 보강 → 425/426 관련도 게시). **BigQuery 무료 티어 내, SQL 없음(dedup 멱등).**

---

## 1. 착수 전 확인
- 파이프라인 재사용: 발견 URL 을 `RawItem` 으로 만들어 **기존 크롤 ingest 경로**(`processCrawlItem`)에 태운다. `processCrawlItem` 은 keywords/groups/budgets 등 컨텍스트가 필요하므로, **`runCrawl` 이 이미 구성하는 컨텍스트를 재사용**하는 게 최선(§2.3).
- 425/426: isSearchSourced 로 넣으면 짧은 stub 도 pending → 보강 → 관련도 게이트. (본문은 원문에서 보강.)
- **GDELT 데이터**: `gdelt-bq.gdeltv2.gkg_partitioned`(날짜 파티션). 필드 `DATE`, `DocumentIdentifier`(URL), `SourceCommonName`(매체 도메인), `V2Organizations`·`V2Persons`·`AllNames`·`V2Themes`(엔티티·테마).

## 2. 구현

### 2.1 BigQuery 클라이언트 `src/lib/crawler/gdelt-bigquery.ts`
- 의존성 추가: `@google-cloud/bigquery`.
- 인증: env **`GCP_SA_KEY`**(서비스계정 JSON 문자열) 파싱 → `new BigQuery({ projectId, credentials })`. **env 없으면 사용처에서 graceful skip.**
- `queryGdeltMonth({ from, to, keywordTerms, koreanDomains, maxBytes }): Promise<{ url: string; date: string; domain: string }[]>`
  - **🔴 비용 가드(무료 티어 유지)**:
    - **파티션 필터**: `_PARTITIONTIME >= @from AND _PARTITIONTIME < @to` (월 단위).
    - **컬럼 프루닝**: `SELECT DocumentIdentifier, DATE, SourceCommonName` 만.
    - **한국 필터**: `SourceCommonName` 이 한국 매체(도메인 리스트 or `LIKE '%.kr'`).
    - **키워드/엔티티 필터**: 관심 키워드(경쟁사·서비스·통신 등)가 `V2Organizations`/`V2Persons`/`AllNames` 에 매칭(관련분만 — 전량 금지).
    - **`maximumBytesBilled`** 잡 옵션으로 **하드 상한**(예: 50GB) — 초과 시 쿼리 실패(런어웨이 비용 차단).
  - 실행 후 `job.metadata.statistics.totalBytesProcessed` **로깅**(스캔량 관찰).
- ⚠️ **1회 호출 = 1개월 창**(6개월을 한 번에 긁지 않는다).

### 2.2 엔드포인트 `src/app/api/cron/gdelt-backfill/route.ts`
- GET, `Bearer CRON_SECRET`. `runtime='nodejs'`, `maxDuration=300`.
- 파라미터 `?month=YYYY-MM`(필수) 또는 `?from=&to=` — **지정 월 창만** 처리(SQL-free, 상태 없음).
- 흐름: `queryGdeltMonth(window)` → URL 목록 → `RawItem[]`(original_url, title 미상이면 도메인 기반 임시 or 후속 보강에서, published_at=DATE) → **ingest**(§2.3) → 카운트 반환.
- env(`GCP_SA_KEY`) 없으면 `{ ok:true, skipped:true, reason:'GCP 키 없음' }`.
- **멱등**: 같은 월 재호출해도 canonical/hash dedup 이 기존분 스킵 → 재실행 안전.

### 2.3 ingest 재사용 (컨텍스트)
- **권장(a)**: `runCrawl` 에 **GDELT 백필 모드** 추가 — `runCrawl({ gdeltBackfill: { from, to } })` 가 기존처럼 keywords/groups/budgets 를 구성한 뒤, 소스 폴링 대신 `queryGdeltMonth` 결과를 `processCrawlItem`(isSearchSourced) 로 처리. runCrawl 컨텍스트 재사용이라 중복 0.
  - 이때 엔드포인트는 `runCrawl({ gdeltBackfill })` 호출만.
- **대안(b)**: `processCrawlItem` 호출에 필요한 최소 컨텍스트 로더를 별도 헬퍼로 — (a) 가 부담되면.
- 착수 시 `runCrawl` 구조 정독 후 (a)/(b) 택1, §기록란에 명시.

## 3. 하지 말 것
- **전체 6개월을 한 쿼리로 긁지 않기**(월 단위·바이트 상한 필수).
- `maximumBytesBilled` 없이 쿼리 금지(비용 폭주 방지).
- 본문을 GDELT 로 확정하지 않기(원문 보강).
- env 없을 때 에러/중단 금지(graceful skip).
- 커서/상태 테이블 만들지 않기(파라미터+dedup 로 SQL-free).
- 기존 크롤·네이버·GDELT DOC·RSS 수집 로직 무변경(백필 경로 추가만).

## 4. 회귀 가드
1. `GCP_SA_KEY` 있으면 지정 월의 한국 관련 기사 URL 이 수집(stub)됨.
2. stub → 보강 → **425/426 관련도 통과분만 게시**(off-topic 유입 없음).
3. 같은 월 재호출 시 중복 안 생김(dedup).
4. **쿼리 스캔량이 상한(maximumBytesBilled) 내**, 로그에 totalBytesProcessed.
5. env 없으면 graceful skip(에러 아님).
6. 기존 수집(DOC·네이버·RSS·크론) 무영향.
7. 배포·빌드 정상(@google-cloud/bigquery 추가).

## 5. 검증
```bash
npx tsc --noEmit && npm run lint && npm run build
ls src/lib/crawler/gdelt-bigquery.ts src/app/api/cron/gdelt-backfill/route.ts
grep -n "gkg_partitioned\|_PARTITIONTIME\|maximumBytesBilled\|DocumentIdentifier\|totalBytesProcessed\|GCP_SA_KEY" src/lib/crawler/gdelt-bigquery.ts
grep -n "gdeltBackfill\|queryGdeltMonth\|processCrawlItem" src/lib/crawler/orchestrator.ts src/app/api/cron/gdelt-backfill/route.ts
grep -n "@google-cloud/bigquery" package.json
git diff --stat origin/main
```
**라이브(수희 GCP 키 설정 후)**
- [ ] `?month=2026-01` 트리거 → 해당 월 한국 기사 stub 수집
- [ ] BigQuery 스캔량 상한 내(로그 확인), 무료 티어 유지
- [ ] 보강·관련도 게시 정상, 중복 없음
- [ ] 6개월(01~06) 순차 트리거로 소급 완료

## 6. 커밋
브랜치 `agent/432-gdelt-bigquery` → 커밋·푸시 → 재현검증 → **(GCP 키 확인 후) "커밋해"** → 머지.
스테이징: `src/lib/crawler/gdelt-bigquery.ts`·`src/app/api/cron/gdelt-backfill/route.ts`(신규) · `src/lib/crawler/orchestrator.ts`(백필 모드) · `package.json`(@google-cloud/bigquery) · 이 지시서
제외: 상시 목록(topic-covers NFD·council-bridge·성능-리전이동·골드샘플).
커밋: `feat: GDELT BigQuery 과거 6개월 백필(월청크·비용가드·dedup) (432)`

### 기록란 (구현자)
| 항목 | 결과 |
|---|---|
| 파티션·프루닝·maximumBytesBilled 비용 가드 | |
| 한국·키워드 필터 | |
| ingest 재사용 방식 (a)/(b) | |
| GCP_SA_KEY graceful skip | |
| 월청크·dedup 멱등 | |

## 7. 스케줄러·운영
- 초기 6개월 소급: `?month=2026-01`…`2026-06` 순차 트리거(수동 or 스케줄러 6회).
- 이후: 최근 1~2개월 주기 재실행(신규 보완). 스케줄러는 C 워커 패턴(pg_cron/GitHub Actions) 재사용, **저빈도**.
- **David/수희 준비물**: GCP 프로젝트 → BigQuery API → 서비스계정 JSON → Vercel `GCP_SA_KEY`. (무료 티어 내 — 월 파티션·프루닝.)

## 8. 다음
- GDELT tone/theme 를 신호로 저장(질적 데이터 확장) — 별건.
- 6개월 초과 더 깊은 과거 필요 시 빅카인즈 재검토.
