-- 137: LLM 신호 분류 진행 마커. 멱등.
alter table public.contents
  add column if not exists signals_classified_at timestamptz;
create index if not exists contents_signals_classified_idx
  on public.contents (signals_classified_at);
