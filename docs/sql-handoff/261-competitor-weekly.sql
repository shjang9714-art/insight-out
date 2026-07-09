-- 261 주간 경쟁사 동향 리포트 — 테이블 + 프롬프트 시드
-- 핸드오프: 수희 → Supabase SQL Editor. 전체 붙여넣고 RUN(한 번에).
-- 전제: 253(llm_prompts 테이블)·241(contents.lgu_impact)·keyword_groups.

begin;

-- ── 1. 주간 리포트 테이블 ────────────────────────────────────────────────────
create table if not exists public.competitor_weekly_reports (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  week_end   date not null,
  summary    text,
  overall_impact text check (overall_impact in ('위기','기회','관망')),
  emerging_topics text[] not null default '{}',
  sections   jsonb not null default '[]',
  status     text not null default 'draft' check (status in ('draft','published')),
  generated_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (week_start)
);
create index if not exists cwr_week_idx on public.competitor_weekly_reports (week_start desc);

alter table public.competitor_weekly_reports enable row level security;

drop policy if exists "cwr: 인증 조회(published)" on public.competitor_weekly_reports;
create policy "cwr: 인증 조회(published)" on public.competitor_weekly_reports
  for select using (auth.uid() is not null and status = 'published');

drop policy if exists "cwr: admin 전체" on public.competitor_weekly_reports;
create policy "cwr: admin 전체" on public.competitor_weekly_reports
  for all using (public.is_admin()) with check (public.is_admin());

-- ── 2. 프롬프트 시드 (어드민 편집 대상) ──────────────────────────────────────
insert into public.llm_prompts (key, label, prompt_text) values
  ('competitor_weekly_area', '주간 경쟁 리포트 — 사업영역별 종합',
$prompt$당신은 LG U+ B2B 경쟁 인텔리전스 수석 분석가다. 아래는 이번 주 '{area_label}' 영역의 경쟁사 관련 기사들이다. 이를 종합해 LG U+ 관점의 경쟁 동향을 분석하라.
**반드시 한국어로만 작성한다(고유명사 제외 영어 금지).** 단순 나열('누가 무엇을 했다') 금지 — 흩어진 사실을 하나의 흐름으로 종합하고 해석하라.
출력(JSON):
- moves: 이번 주 이 영역의 핵심 경쟁 움직임 2~4개를 종합 서술(각 서술 끝에 근거 [content_id]). 경쟁사별 사실을 연결해 "무슨 일이 벌어지고 있는지".
- companies: 이 영역에서 움직인 주요 경쟁사명 배열.
- impact: LG U+ 관점 판정 — "위기"|"기회"|"관망" 중 하나. (경쟁사 약진·잠식=위기, 경쟁사 부진·틈=기회, 중립·불명확=관망)
- implication: LG U+ B2B가 취해야 할 대응·주목점 2~3문장. 근거 밖 단정·과장 금지.
- citations: 핵심 주장별 15단어 이내 인용 + content_id. 3건 이상 권장.
JSON만 출력.$prompt$),
  ('competitor_weekly_summary', '주간 경쟁 리포트 — 주간 헤더 종합',
$prompt$당신은 LG U+ B2B 경쟁 인텔리전스 수석 분석가다. 아래는 이번 주 사업영역별 경쟁 동향 분석 결과다. 종합해 주간 리포트 헤더를 작성하라. 한국어만.
출력(JSON):
- week_summary: 이번 주 경쟁 구도를 한 줄로(공백 포함 24자 내외, 구체적·사실 기반).
- emerging_topics: 이번 주 새로 부상하거나 주목할 주제 2~3개(배열, 각 10자 내외).
- overall_impact: 종합 판정 "위기"|"기회"|"관망" 중 하나.
JSON만 출력.$prompt$)
on conflict (key) do update set label = excluded.label, prompt_text = excluded.prompt_text, updated_at = now();

commit;

-- 검증:
-- select key, label from public.llm_prompts where key like 'competitor_weekly%';
-- select count(*) from public.competitor_weekly_reports;
