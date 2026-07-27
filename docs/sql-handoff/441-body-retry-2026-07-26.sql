-- 441 본문 추출 재시도 정책 (수희 적용)
-- 목적: 본문 보강 1회 실패 시 body_fetched_at 영구 마킹으로 검토대기에 갇히는 문제 해소.
--       실패를 카운트+백오프로 재시도, 상한(코드 MAX_BODY_RETRIES=4) 도달 시에만 포기.
-- 적용 전에도 코드는 graceful(42703 폴백)으로 현행 동작 유지 → 코드 배포와 순서 무관.

alter table contents add column if not exists body_retry_count integer not null default 0;
alter table contents add column if not exists body_next_retry_at timestamptz;

-- 드레인 선정 가속(선택): 재시도 대상만 인덱싱
create index if not exists idx_contents_body_retry
  on contents (body_next_retry_at)
  where body_fetched_at is null and original_url is not null;

-- (선택) 이미 실패로 굳은 과거 body 계열 검토대기 행을 재시도 큐로 되살리려면:
--   body_fetched_at=NULL + retry_count=0 로 리셋해 즉시 재시도 대상화. (신중 적용 — 대량일 수 있음)
-- update contents set body_fetched_at = null, body_retry_count = 0, body_next_retry_at = null
--   where status='pending' and review_reason in ('body_truncated','body_short','body_missing','extract_failed')
--     and original_url is not null;
