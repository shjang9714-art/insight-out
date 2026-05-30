-- ============================================================
-- [수희 실행용] Phase 1-B · STEP 4/4 — Row Level Security
-- 적용처: Supabase 대시보드 → SQL Editor → 붙여넣기 → Run
-- 선행조건: 03-triggers.sql 완료
-- 완료 후: 용주에게 "콘텐츠/북마크 스키마 적용 완료" 알려주세요
-- ============================================================


-- ============================================================
-- RLS 활성화
-- ============================================================

alter table public.sources           enable row level security;
alter table public.keywords          enable row level security;
alter table public.contents          enable row level security;
alter table public.content_services  enable row level security;
alter table public.content_keywords  enable row level security;
alter table public.youtube_videos    enable row level security;
alter table public.ai_reports        enable row level security;
alter table public.ai_report_sources enable row level security;
alter table public.bookmarks         enable row level security;
alter table public.archives          enable row level security;
alter table public.archive_items     enable row level security;


-- ============================================================
-- 공개 카탈로그·콘텐츠: 인증 사용자 조회 / admin 관리
-- (크롤러는 service_role 키로 RLS 우회하여 적재)
-- ============================================================

create policy "sources: 인증 사용자 조회"
  on public.sources for select using (auth.role() = 'authenticated');
create policy "sources: admin 관리"
  on public.sources for all using (public.is_admin()) with check (public.is_admin());

create policy "keywords: 인증 사용자 조회"
  on public.keywords for select using (auth.role() = 'authenticated');
create policy "keywords: admin 관리"
  on public.keywords for all using (public.is_admin()) with check (public.is_admin());

create policy "contents: 인증 사용자 조회"
  on public.contents for select using (auth.role() = 'authenticated' and is_published);
create policy "contents: admin 전체 조회"
  on public.contents for select using (public.is_admin());
create policy "contents: admin 관리"
  on public.contents for all using (public.is_admin()) with check (public.is_admin());

create policy "content_services: 인증 사용자 조회"
  on public.content_services for select using (auth.role() = 'authenticated');
create policy "content_services: admin 관리"
  on public.content_services for all using (public.is_admin()) with check (public.is_admin());

create policy "content_keywords: 인증 사용자 조회"
  on public.content_keywords for select using (auth.role() = 'authenticated');
create policy "content_keywords: admin 관리"
  on public.content_keywords for all using (public.is_admin()) with check (public.is_admin());

create policy "youtube_videos: 인증 사용자 조회"
  on public.youtube_videos for select using (auth.role() = 'authenticated');
create policy "youtube_videos: admin 관리"
  on public.youtube_videos for all using (public.is_admin()) with check (public.is_admin());


-- ============================================================
-- AI 보고서: 본인 데이터 + admin 전체
-- ============================================================

create policy "ai_reports: 본인 조회"
  on public.ai_reports for select using (auth.uid() = user_id);
create policy "ai_reports: 본인 추가"
  on public.ai_reports for insert with check (auth.uid() = user_id);
create policy "ai_reports: 본인 수정"
  on public.ai_reports for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ai_reports: 본인 삭제"
  on public.ai_reports for delete using (auth.uid() = user_id);
create policy "ai_reports: admin 전체 조회"
  on public.ai_reports for select using (public.is_admin());

create policy "ai_report_sources: 본인 조회"
  on public.ai_report_sources for select
  using (exists (select 1 from public.ai_reports r
                 where r.id = ai_report_id and r.user_id = auth.uid()));
create policy "ai_report_sources: 본인 추가"
  on public.ai_report_sources for insert
  with check (exists (select 1 from public.ai_reports r
                      where r.id = ai_report_id and r.user_id = auth.uid()));
create policy "ai_report_sources: 본인 삭제"
  on public.ai_report_sources for delete
  using (exists (select 1 from public.ai_reports r
                 where r.id = ai_report_id and r.user_id = auth.uid()));


-- ============================================================
-- 북마크: 본인 데이터
-- ============================================================

create policy "bookmarks: 본인 조회"
  on public.bookmarks for select using (auth.uid() = user_id);
create policy "bookmarks: 본인 추가"
  on public.bookmarks for insert with check (auth.uid() = user_id);
create policy "bookmarks: 본인 삭제"
  on public.bookmarks for delete using (auth.uid() = user_id);


-- ============================================================
-- 아카이브: 본인 데이터
-- ============================================================

create policy "archives: 본인 조회"
  on public.archives for select using (auth.uid() = user_id);
create policy "archives: 본인 추가"
  on public.archives for insert with check (auth.uid() = user_id);
create policy "archives: 본인 수정"
  on public.archives for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "archives: 본인 삭제"
  on public.archives for delete using (auth.uid() = user_id);

-- archive_items: 소속 아카이브 소유권으로 판정
create policy "archive_items: 본인 조회"
  on public.archive_items for select
  using (exists (select 1 from public.archives a
                 where a.id = archive_id and a.user_id = auth.uid()));
create policy "archive_items: 본인 추가"
  on public.archive_items for insert
  with check (exists (select 1 from public.archives a
                      where a.id = archive_id and a.user_id = auth.uid()));
create policy "archive_items: 본인 수정"
  on public.archive_items for update
  using (exists (select 1 from public.archives a
                 where a.id = archive_id and a.user_id = auth.uid()));
create policy "archive_items: 본인 삭제"
  on public.archive_items for delete
  using (exists (select 1 from public.archives a
                 where a.id = archive_id and a.user_id = auth.uid()));
