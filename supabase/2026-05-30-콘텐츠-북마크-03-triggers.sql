-- ============================================================
-- [수희 실행용] Phase 1-B · STEP 3/4 — 트리거 & 함수
-- 적용처: Supabase 대시보드 → SQL Editor → 붙여넣기 → Run
-- 선행조건: 02-tables.sql 완료
-- 다음 단계: 04-rls.sql
-- ============================================================


-- ============================================================
-- updated_at 자동 갱신 트리거 (신규 테이블)
-- ※ set_updated_at() 함수는 기존 스키마에 이미 있음
-- ============================================================

create trigger set_sources_updated_at
  before update on public.sources
  for each row execute function public.set_updated_at();

create trigger set_contents_updated_at
  before update on public.contents
  for each row execute function public.set_updated_at();

create trigger set_youtube_videos_updated_at
  before update on public.youtube_videos
  for each row execute function public.set_updated_at();

create trigger set_ai_reports_updated_at
  before update on public.ai_reports
  for each row execute function public.set_updated_at();

create trigger set_archives_updated_at
  before update on public.archives
  for each row execute function public.set_updated_at();


-- ============================================================
-- bookmark_count 동기화 (북마크 추가/삭제 시 contents 카운터 갱신)
-- ============================================================

create or replace function public.sync_content_bookmark_count()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') and new.content_id is not null then
    update public.contents
      set bookmark_count = bookmark_count + 1
      where id = new.content_id;
  elsif (tg_op = 'DELETE') and old.content_id is not null then
    update public.contents
      set bookmark_count = greatest(bookmark_count - 1, 0)
      where id = old.content_id;
  end if;
  return null;
end;
$$;

create trigger sync_bookmark_count_ins
  after insert on public.bookmarks
  for each row execute function public.sync_content_bookmark_count();

create trigger sync_bookmark_count_del
  after delete on public.bookmarks
  for each row execute function public.sync_content_bookmark_count();
