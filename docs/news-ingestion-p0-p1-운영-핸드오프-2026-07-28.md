# News Ingestion P0/P1 운영 핸드오프

## 적용 순서

1. `supabase/2026-07-28-news-ingestion-p0-p1.sql`을 Supabase SQL Editor에서 실행한다.
2. Vercel Production 환경변수에 아래 값을 추가한다.

```text
NAVER_API_HUB_CLIENT_ID
NAVER_API_HUB_CLIENT_SECRET
```

3. 배포 후 CRON_SECRET 인증으로 두 Route Handler를 각각 한 번 호출해 응답을 확인한다.

```text
GET /api/cron/discovery?providers=direct_rss,direct_sitemap&force=true
GET /api/cron/discovery?providers=naver
GET /api/cron/candidate-worker?limit=30
```

4. `article_candidates`, `candidate_discoveries`, `candidate_attempts`, `job_runs`에서 결과를 확인한다.
5. 7일간 기존 `/api/cron/crawl`과 병행한 뒤 기사 누락·중복·본문 성공률을 비교한다.

## 권장 Supabase 스케줄

Vercel Hobby Cron에 반복 작업을 추가하지 않는다. 기존 `pg_cron`/`pg_net` 호출 방식에서 다음 주기로 등록한다.

| 주기 | 호출 경로 | 역할 |
|---|---|---|
| 15분 | `/api/cron/discovery?providers=direct_rss,direct_sitemap&force=true` | 직접 수집원 발견 |
| 30분 | `/api/cron/discovery?providers=naver` | 국내 뉴스 검색 |
| 2시간 | `/api/cron/discovery?providers=google,gdelt_doc` | 누락 보강 |
| 5분 | `/api/cron/candidate-worker?limit=30` | 본문 처리 |

URL과 CRON_SECRET은 SQL 문자열에 직접 저장하지 않고 Supabase Vault 또는 현재 운영 중인 비밀값 저장 방식을 사용한다.

## News Sitemap 등록

뉴스 Sitemap을 쓰는 소스는 다음처럼 설정한다.

```sql
update public.sources
set adapter_key = 'generic-sitemap',
    rss_url = 'https://example.com/news-sitemap.xml'
where id = '<source-id>';
```

현재 구현은 `<news:title>`과 `<news:publication_date>`가 있는 Google News Sitemap 규격을 지원한다. 일반 Sitemap은 제목이 없어 후보를 만들지 않는다.

## 운영 판정

- `candidate_discoveries.provider` 식별률: 100%
- 동일 `discovery_key` 재실행 시 행 증가 없음
- 동일 Canonical URL은 먼저 발견된 후보로 출처 병합
- 본문 처리 실패는 `retry_wait`, 4회 실패는 `dead_letter`
- `job_runs.meta.providers`에서 NAVER 설정 누락·API 오류·제공자별 발견 수 확인

## 전환 주의사항

- 기존 `/api/cron/crawl`은 YouTube와 기존 파이프라인 보호를 위해 이번 단계에서 제거하지 않는다.
- 새 스케줄을 켜기 전에 반드시 DB SQL을 먼저 적용한다.
- 기존 NAVER 개발자센터 키는 임시 폴백만 제공한다. 신규 운영값은 API HUB 키를 사용한다.
- Google News 가상 소스는 7일 병행 검증 전 삭제하거나 비활성화하지 않는다.
