-- 189: 작업(work) 항목용 컬럼. ops_requests(187)를 작업 현황 단일 소스로 확장.
-- phase = 작업 그룹(예: "AI 인사이트 IA", "어드민 v2", "수집 품질"), seq = 그룹 내 정렬.
alter table ops_requests add column if not exists phase text;
alter table ops_requests add column if not exists seq  integer;

create index if not exists idx_ops_requests_work
  on ops_requests (post_type, phase, seq);
