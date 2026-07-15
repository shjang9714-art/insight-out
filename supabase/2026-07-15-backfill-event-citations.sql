-- 지시서 20260715: entity_events.citations 이중 직렬화 버그 백필
-- 원인: 쓰기 코드(events/route.ts, cron/event-timeline-refresh/route.ts)가
--   citations: JSON.stringify(ev.citations) 로 배열을 문자열로 한 번 더 인코딩해서 저장 —
--   jsonb 컬럼에 배열이 아니라 "[...]" 형태의 스칼라 문자열이 들어감.
-- 반면 같은 값이 source_content_ids(uuid[])에는 정상 배열로 저장되어 있었음(92%).
-- 실측 확인: jsonb_typeof(citations) 그룹별 count 결과 전체 506건이 전부 'string' 타입
--   (jsonb 빈 배열 '[]' 로 남아있는 행은 0건) — 애초 조건(jsonb_typeof='array' and
--   jsonb_array_length=0)은 매칭 0건이라 이 상태로는 백필되지 않았음. 'array' 아닌
--   모든 값(= 전량 'string')을 잡도록 조건을 넓힘.
-- 코드 수정(JSON.stringify 제거) 이후에도 기존 506건은 이미 깨진 채 저장돼 있으므로
-- source_content_ids 값을 citations 로 역백필.

-- 1) 실행 전 영향받는 행 수 확인
select
  count(*) filter (
    where (jsonb_typeof(citations) != 'array' or jsonb_array_length(citations) = 0)
      and source_content_ids is not null and array_length(source_content_ids, 1) > 0
  ) as rows_to_backfill,
  count(*) filter (
    where jsonb_typeof(citations) = 'array' and jsonb_array_length(citations) > 0
  ) as rows_already_valid_array,
  count(*) as total_rows
from public.entity_events;

-- 2) 백필: citations가 정상 array가 아니거나 빈 배열이고, source_content_ids에 값이 있는 행만 갱신
update public.entity_events
set citations = to_jsonb(source_content_ids)
where (jsonb_typeof(citations) != 'array' or jsonb_array_length(citations) = 0)
  and source_content_ids is not null
  and array_length(source_content_ids, 1) > 0;

-- 3) 실행 후 확인 (rows_to_backfill 이 0이 되고 rows_already_valid_array 가 그만큼 늘어야 정상)
select
  count(*) filter (
    where (jsonb_typeof(citations) != 'array' or jsonb_array_length(citations) = 0)
      and source_content_ids is not null and array_length(source_content_ids, 1) > 0
  ) as rows_to_backfill,
  count(*) filter (
    where jsonb_typeof(citations) = 'array' and jsonb_array_length(citations) > 0
  ) as rows_already_valid_array,
  count(*) as total_rows
from public.entity_events;
