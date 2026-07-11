-- 274 전략보고서 발행 모델 — ai_reports 컬럼 확장 + strategy_report 프롬프트 시드
-- 핸드오프: 수희 → Supabase SQL Editor. 전체 RUN(한 번에). 멱등.
-- 전제: 253(llm_prompts 테이블). ai_reports 는 기존 존재.
-- 설계: docs/설계-전략보고서-리서치카드형-정기발행.md

begin;

-- ── A. ai_reports 컬럼 확장(리서치 카드형 + HTML 본문 + 발행) ─────────────────
alter table public.ai_reports
  add column if not exists body_html       text,                       -- 본문(HTML, 주 렌더)
  add column if not exists summary          text,                       -- 카드 요약 2~3줄
  add column if not exists cover_image_url  text,                       -- 표지(업로드/AI)
  add column if not exists publisher        text default '인사이트 아웃', -- 발행자
  add column if not exists published_at     timestamptz,                -- 발행일(null=미발행) — 발행 게이트
  add column if not exists topic            text;                       -- 주제(자유), type 은 분류 배지 유지

-- 서비스 노출은 status 열거형 변경 없이 published_at 로 판정(마이그레이션 리스크 회피):
--   published_at is not null = 발행됨 = 서비스 카드 노출.
create index if not exists ai_reports_published_at_idx
  on public.ai_reports (published_at desc) where published_at is not null;

-- ── B. strategy_report 프롬프트 시드(어드민 편집 — 퀄리티 핵심) ────────────────
insert into public.llm_prompts (key, label, prompt_text) values
('strategy_report', '전략보고서 생성(HTML)',
'당신은 LG U+ B2B 시장정보 수석 애널리스트다. 주어진 주제와 참고 자료(이슈·기사 요약)를 바탕으로 임원 대상 전략보고서를 작성한다.

[출력 형식]
- 반드시 한국어. 전체를 유효한 HTML 조각으로 출력(마크다운·코드펜스 금지). <h2>/<h3>/<p>/<ul>/<li>/<table> 등 시맨틱 태그만 사용, style 속성·script·iframe 금지.
- 구조: <h2>핵심 요약</h2> → <h2>배경/맥락</h2> → <h2>핵심 분석</h2>(근거·데이터 포함) → <h2>시사점(LG U+ 관점)</h2> → <h2>전망·제언</h2>.
- 맨 앞에 한 줄로 카드용 요약을 넣되, 다음 형식으로 시작: <!--SUMMARY: 2~3문장 요약 --> 그 뒤에 본문 HTML.

[내용 원칙]
- 과장·추측 금지, 참고 자료 근거 기반. LG U+ B2B(AIDC·AICC·통신B2B·보안·클라우드) 관점의 시사점을 명확히.
- 숫자·고유명사는 자료에 있는 것만. 불확실하면 단정하지 말 것.
- 임원이 3분 내 핵심을 얻도록 간결·구조적으로.')
on conflict (key) do update set
  label = excluded.label, prompt_text = excluded.prompt_text, updated_at = now();

commit;

-- ============================================================
-- 검증
-- ============================================================
select column_name from information_schema.columns
where table_schema='public' and table_name='ai_reports'
  and column_name in ('body_html','summary','cover_image_url','publisher','published_at','topic')
order by column_name;

select key, label from public.llm_prompts where key = 'strategy_report';
