-- ★ 실행 필요: Supabase SQL Editor에서 직접 실행
-- 이슈 근거 콘텐츠 드릴다운 뷰: (issue_id, content_id) 그레인, 시그널 보유 콘텐츠만
create or replace view public.issue_evidence as
select
  ic.issue_id,
  c.id                                       as content_id,
  c.title,
  c.summary_ko,
  c.original_url,
  c.thumbnail_url,
  c.category::text                           as category,
  c.published_at,
  s.name                                     as source_name,
  array_agg(distinct cs.signal_type::text)   as signal_types,
  max(cs.score)                              as max_signal_score,
  count(cs.id)                               as signal_count
from public.issue_contents ic
join public.contents c          on c.id = ic.content_id
left join public.sources s      on s.id = c.source_id
join public.content_signals cs  on cs.content_id = c.id
group by ic.issue_id, c.id, s.name;

-- ★ GRANT 필수 (Data API 노출)
grant select on public.issue_evidence to anon, authenticated;
