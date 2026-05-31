# 🧩 Phase 2-A 자동 크롤링 — 상세 설계 (구현 전, 설계 only)

> 위치: #3 [상위 파이프라인 설계](./크롤링-파이프라인-설계.md) 와 #4 구현 사이의 **상세 설계층**.
> 범위: **설계만.** 코드·SQL 파일·`schema.sql` 변경 없음. 스키마 추가는 "1-B 확정 후 적용 제안"으로만 기재.
> 전제: 아키텍처(TS vs Python) 미확정 → **양쪽에 공통인 로직 수준**으로 설계. 분기 지점만 명시.
> 근거: PRD v2.1 4장(데이터 소스), [작업계획서](./작업계획서.md). 작성 2026-05-31.

---

## 0. 꼬임 방지 원칙 (이 문서가 지키는 것)

- ❌ `supabase/*.sql` 신규 파일 생성 안 함 (수희 1-B 적용 순서와 충돌 방지)
- ❌ `schema.sql` 수정 안 함 (단일 진실, 1-B 적용 중)
- ❌ `src/**` 코드 작성 안 함 (구현은 #4)
- ✅ 문서 1장만 추가. 스키마가 필요하면 **§7 제안 표**에 적고 1-B 완료 후 별도 SQL 핸드오프로 전환.

---

## 1. 전체 데이터 흐름 (확정)

```
Vercel Cron 05:00 KST
  → /api/cron/crawl (시크릿 검증)
    → Orchestrator
       1) sources 조회 (is_active, 주기 도래)
       2) 소스별 Adapter.fetch(source, since=오늘0시)   ← 격리(allSettled)
       3) Normalizer: 메타 표준화 + title_hash/body_hash
       4) Dedup 3단계 (URL → 제목유사 → 본문해시)
       5) Quality 필터 (길이/광고/관련도/언어)
       6) Upsert contents (service_role, 멱등) + content_services/keywords
       7) crawl_logs 기록
```
> #3 와 동일. 본 문서는 각 단계의 **알고리즘·규칙·계약**을 확정한다.

---

## 2. 소스 어댑터 스펙

### 2.1 공통 인터페이스 (TS/Python 공통 개념)
```
Adapter.fetch(source, since) -> RawItem[]
RawItem { original_url, title, body?, author?, published_at?, thumbnail_url?, language? }
```
- 어댑터는 `source.type` 으로 선택. Phase 2-A 대상은 **`news_site`** 우선(오피니언/유튜브는 Phase 3-A).
- 입력은 `sources` 행(=DB). **소스 목록 하드코딩 금지** (admin 관리).

### 2.2 news_site 어댑터 (RSS 우선 + 본문 폴백)
1. `source.rss_url` 있으면 RSS 파싱 → 항목별 `link/title/pubDate/description`.
2. 본문 부족 시 `original_url` fetch → 본문 추출:
   - TS: `@extractus/article-extractor` 또는 Mozilla Readability(jsdom)
   - Python: `trafilatura` 또는 `newspaper3k`
3. `since`(오늘 0시) 이전 발행분은 버림 (PRD 4.2 "당일 발행분만").
4. 썸네일: og:image 우선.

### 2.3 분기 지점 (아키텍처 결정에 따라만 다름)
| 측면 | TS(권장) | Python |
|---|---|---|
| 본문추출 | article-extractor/Readability | trafilatura/newspaper3k |
| 실행 | Vercel 함수(타임아웃 주의→소스 단위 분할) | 별도 워커(타임아웃 자유) |
| JS렌더 페이지 | 한계 있음(필요시 별 처리) | Scrapy+Splash 등 강함 |

---

## 3. 중복 필터 3단계 — 알고리즘 확정 (PRD 4.4)

| 단계 | 기준 | 알고리즘 | 비용 |
|:---:|---|---|---|
| 1 | URL 중복 | **URL 정규화**(쿼리·UTM·fragment 제거, 소문자 호스트, 끝슬래시 정리) 후 `contents.original_url` upsert `on conflict` | O(1) 인덱스 |
| 2 | 제목 90% 유사 | 정규화(공백·문장부호·대소문자 제거) 후 **(a) `title_hash` 완전일치 선조회** → 미일치 시 **(b) 후보군 대상 유사도** | 中 |
| 3 | 본문 동일 | 본문 정규화 후 **SHA-256 = `body_hash`** 완전일치 | O(1) 인덱스 |

### 3.1 2단계 유사도 — 방식 결정
- **1차(싸게)**: `title_hash` 완전일치로 명백 중복 제거.
- **2차(유사)**: 후보를 좁힌 뒤 유사도 측정. 두 후보안:
  - **A. 정규화 Jaccard/토큰 집합 + 편집거리** — 의존성 0, 한국어 토큰화 단순(공백/형태소 미사용). 90% 임계.
  - **B. TF-IDF 코사인** — 더 정확하나 코퍼스·벡터 인프라 필요(과함).
  - **권장 A** (Phase 2-A 규모엔 충분, pgvector/임베딩은 트렌드보드 Phase 4 때).
- 후보군 좁히기: 같은 날짜(±1d) + 제목 토큰 1개 이상 공유로 1차 필터 후 비교 (전수비교 회피).

### 3.2 유사 중복 처리 (PRD 4.4) — ⚠️ 스키마 의존 (BL-3)
- 완전중복: 스킵(미저장).
- 유사중복(동일 사건 다수 보도): **대표 1건 저장 + "관련 기사 N건" 링크**.
- 현 `contents` 에 그룹 개념 없음 → **§7 제안**: `cluster_id`(자기참조) 또는 `representative_id`.
- 스키마 확정 전엔 구현 보류. **설계상**: 대표=가장 이른 발행/신뢰도 높은 소스.

---

## 4. 품질 필터 규칙 확정 (PRD 4.5)

| 항목 | 기준 | 처리 | 구현 비고 |
|---|---|---|---|
| 본문 길이 | 300자 미만 | 자동 제외 | 정규화 후 글자수 |
| 광고성 | 광고 키워드 패턴 매칭 | 자동 제외 | 패턴 목록 admin 관리 권장(초기엔 상수) |
| 키워드 관련도 | 점수 0.3 미만 | **보류(관리자 검토)** | ⚠️ 보류 상태 필요(BL-4) |
| 언어 | 한/영 외 | admin 설정 포함/제외 | `original_language` 판정 |
| 저품질 매체 | 블랙리스트 | 수집 소스 단계 제외 | `sources.is_active=false` 로 처리 |

### 4.1 키워드 관련도 점수 (0~1)
- 초기(임베딩 전): **매칭 기반** — 등록 `keywords` 가 제목/본문에 등장하는 빈도·위치 가중합 정규화.
- 0.3 미만 = "보류" → 어드민 "콘텐츠 승인 대기 목록"(PRD 6.1)에서 검토.
- ⚠️ 보류/승인 상태는 현 `is_published` boolean 2상태로 부족 → **§7 제안**: `pending/published/rejected`.

### 4.2 필터 적용 위치
- 본문길이·광고·언어: **적재 전**(싼 필터 먼저).
- 관련도: 적재하되 `status=pending`(보류) — 버리지 않고 관리자 검토 큐로.

---

## 5. /api/cron/crawl 계약 (구현 무관 설계)

| 항목 | 값 |
|---|---|
| 메서드 | POST |
| 인증 | `Authorization: Bearer ${CRON_SECRET}` (불일치 401) |
| 트리거 | Vercel Cron `0 20 * * *`(UTC)=05:00 KST |
| 응답 | `{ ok, sources_total, success, failed, inserted, duplicates, held }` |
| 멱등 | 같은 글 재실행해도 중복無 (`on conflict original_url`) |
| 격리 | 소스별 try (allSettled) — 1개 실패가 전체 중단 안 함 |
| 재시도 | 소스 내 3회 지수백오프(0.5/1/2s), 실패 시 `crawl_logs.failed` + 다음 틱 |

### 5.1 Orchestrator 의사코드
```
sources = db.sources.active().dueNow()
for s of sources (allSettled):
  log = crawl_logs.start(s)
  try:
    raw = adapter(s.type).fetch(s, since=todayStart)
    for item in raw:
      norm = normalize(item)                 # hash 계산
      if dedup.urlHit(norm): dup++; continue
      if dedup.titleSimHit(norm): dup++; continue
      if dedup.bodyHashHit(norm): dup++; continue
      q = quality(norm)
      if q.reject: continue
      contents.upsert(norm, status = q.hold ? 'pending':'published')
      map services/keywords
      inserted++ (or held++)
    log.success(counts); s.touch(last_crawled_at)
  catch e: log.failed(e)
```

---

## 6. Seed 데이터 전략 (소스/키워드)

소스는 admin 관리이나, **초기 가동용 seed** 필요. PRD 4장 카테고리 기준 후보(확정은 admin/David):
- **국내 IT/산업 뉴스**(news_site, RSS): 전자신문, ZDNet Korea, 디지털데일리, 블로터, IT조선 등 — RSS 제공처 우선.
- **벤더 공식 블로그**(opinion_channel, RSS, Phase 3-A): AWS/Google Cloud/Microsoft/Cisco.
- **오피니언**(Substack/Medium, Phase 3-A): ICT·AI 필진.
- **키워드 seed**: 서비스별 핵심어 + 경쟁사명(`is_competitor=true`). 예: AI 에이전트, Private 5G, 제로 트러스트, GenAI(기존 `SAVED_KEYWORDS` 참고).

> seed 는 1-B 적용·서비스 분류(BL-1) 확정 후 `sources`/`keywords` INSERT 핸드오프로 별도 작성. **지금은 목록 제안까지만.**

---

## 7. 스키마 추가 제안 (⚠️ 1-B 확정 후 적용 — 지금 SQL 만들지 않음)

| 제안 | 내용 | 사유 | 연관 |
|---|---|---|---|
| `crawl_logs` 테이블 | 소스별 수집 로그(성공/실패/건수) | 어드민 크롤링 현황(#23) | #3 §6 |
| `contents.status` enum | `pending`/`published`/`rejected` (현 `is_published` 대체/병행) | 품질 보류·승인 큐(PRD 6.1) | BL-4 |
| `contents.cluster_id` (또는 `representative_id`) | 유사중복 그룹/대표 | "관련 기사 N건"(PRD 4.4) | BL-3 |
| `sources.is_blacklisted` (선택) | 저품질 매체 | PRD 4.5 | — |

> 이 표는 **설계 합의용**. 1-B(수희 SQL) 완료 확인 후 → 별도 `supabase/2026-XX-크롤링-스키마.sql` 핸드오프로 전환 → 수희 실행.

---

## 8. 구현 분해 (#4 이후, 참고)

| 작업 | 주체 | 비고 |
|---|---|---|
| `/api/cron/crawl` + news_site 어댑터 + 멱등 upsert + crawl_logs | Opus(#4) | 아키텍처 결정 후 |
| URL정규화 + 1·3단계 해시 dedup | Opus(#4) | |
| 2단계 제목유사(§3.1 A안) | Sonnet(#12) | |
| 품질필터(§4) | Sonnet(#13) | |
| 어드민 크롤링 현황(crawl_logs 렌더) | Sonnet(#23) | |

---

## 9. 미해결 (결정 대기)
1. **아키텍처 TS vs Python** (Opus 권장 TS) — #4 착수 전 필수.
2. **§7 스키마 추가** — 1-B 완료 후 적용.
3. **BL-1 서비스 분류** — seed 소스/키워드·콘텐츠 매핑에 영향.

*설계 only. 코드·SQL·schema.sql 무변경 확인. 작성 2026-05-31.*
