-- 265 유튜브 자막 수집·번역 — contents 자막 컬럼 4개 + 백필 인덱스
-- 핸드오프: 수희 → Supabase SQL Editor. 전체 붙여넣고 RUN(한 번에). 멱등.
-- 전제: 없음(contents 테이블만 필요). 유튜브 정본은 contents(category='유튜브') — orchestrator.ts 확인.
-- 적용 후 점등: 어드민 "유튜브 자막 수집" 백필 + 유튜브 상세의 번역 스크립트 패널(264).
--
-- ⚠️ 지시서 265 §1 대비 추가된 컬럼: transcript_fetched_at
--    사유: 지시서 SQL(transcript/transcript_ko/transcript_lang)만으로는 백필 대상을
--    "transcript is null"로 잡을 수밖에 없는데, 그러면 **자막이 아예 없는 영상**(상당수)을
--    매 회차 영원히 재시도한다 → 265 §3이 경고한 rate limit·ToS 위험을 자초.
--    219(썸네일)·282(fresh/retry)가 쓰는 *_fetched_at 마커 패턴을 그대로 적용해
--    "미시도(null) / 시도완료(값)"를 구분한다. 자막 없음도 '시도 완료'로 마킹.

begin;

-- ── 1. 자막 컬럼 ─────────────────────────────────────────────────────────────
alter table public.contents
  add column if not exists transcript          text,        -- 원문 자막(언어 원본, 길이 상한은 코드에서 컷)
  add column if not exists transcript_ko       text,        -- 번역 스크립트(한글). 원본이 ko면 transcript와 동일
  add column if not exists transcript_lang     text,        -- 자막 언어(ko/en/…)
  add column if not exists transcript_fetched_at timestamptz; -- 자막 수집 시도 시각(null=미시도, 값=시도완료·자막없음 포함)

-- ── 2. 백필 대상 조회 인덱스(미시도 유튜브 영상) ─────────────────────────────
-- drainYoutubeTranscript(fresh) 가 category='유튜브' AND transcript_fetched_at IS NULL 을 스캔한다.
create index if not exists contents_youtube_transcript_pending_idx
  on public.contents (collected_at desc)
  where category = '유튜브' and transcript_fetched_at is null;

commit;

-- ── 확인용(선택) ─────────────────────────────────────────────────────────────
--   select column_name, data_type
--     from information_schema.columns
--    where table_name = 'contents'
--      and column_name like 'transcript%'
--    order by ordinal_position;
--
-- 대상 영상 수(미시도):
--   select count(*) from public.contents
--    where category = '유튜브' and transcript_fetched_at is null;
