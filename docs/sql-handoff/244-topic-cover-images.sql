-- 244 생성이미지 커버 풀 — topic_cover_images 테이블 + topic-covers 버킷
-- 핸드오프: 수희 → Supabase SQL Editor. 전체 붙여넣고 RUN(한 번에).
-- 목적: 썸네일 없는 콘텐츠 카드에 엔티티/키워드그룹/카테고리별 생성이미지를 폴백 커버로.
--   폴백 체인: 실제 thumbnail_url → topic_cover_images(이번) → BrandedCover.

begin;

-- ── 1. 커버 이미지 매핑 테이블 ───────────────────────────────────────────────
create table if not exists public.topic_cover_images (
  id         uuid primary key default gen_random_uuid(),
  key_type   text not null check (key_type in ('entity', 'group', 'category')),
  -- entity: entities.id(uuid 문자열) / group: keyword_groups.name / category: contents.category 값
  key_ref    text not null,
  image_url  text not null,               -- topic-covers 버킷 public URL
  is_active  boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists topic_cover_images_key_idx
  on public.topic_cover_images (key_type, key_ref) where is_active;

alter table public.topic_cover_images enable row level security;

drop policy if exists "topic_cover_images: 인증 조회" on public.topic_cover_images;
create policy "topic_cover_images: 인증 조회" on public.topic_cover_images
  for select using (auth.uid() is not null);

drop policy if exists "topic_cover_images: admin 전체" on public.topic_cover_images;
create policy "topic_cover_images: admin 전체" on public.topic_cover_images
  for all using (public.is_admin()) with check (public.is_admin());

-- ── 2. 스토리지 버킷(public) ─────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('topic-covers', 'topic-covers', true)
on conflict (id) do nothing;

-- 버킷 정책: public read + admin write (report-covers 버킷과 동일 관례)
drop policy if exists "topic-covers: public read" on storage.objects;
create policy "topic-covers: public read" on storage.objects
  for select using (bucket_id = 'topic-covers');

drop policy if exists "topic-covers: admin write" on storage.objects;
create policy "topic-covers: admin write" on storage.objects
  for insert with check (bucket_id = 'topic-covers' and public.is_admin());

drop policy if exists "topic-covers: admin update" on storage.objects;
create policy "topic-covers: admin update" on storage.objects
  for update using (bucket_id = 'topic-covers' and public.is_admin());

drop policy if exists "topic-covers: admin delete" on storage.objects;
create policy "topic-covers: admin delete" on storage.objects
  for delete using (bucket_id = 'topic-covers' and public.is_admin());

commit;

-- 검증:
-- select key_type, key_ref, count(*) from public.topic_cover_images group by 1,2 order by 1,2;
-- select id, public from storage.buckets where id = 'topic-covers';
