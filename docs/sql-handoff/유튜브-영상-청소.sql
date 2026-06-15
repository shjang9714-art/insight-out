-- 유튜브 영상·채널 청소 (수희 Supabase SQL Editor 실행)
-- 목적: 현재 적재된 관련 없는 유튜브 영상 전체 삭제 + 무관 유튜브 채널 소스 삭제.
--       유튜브 소싱을 채널 RSS → YouTube Data API 키워드 검색(지시서 60)으로 재설계하므로 클린 슬레이트로 비운다.
-- 안전: youtube_videos.source_id 는 ON DELETE SET NULL → 소스를 먼저 지워도 영상은 남는다(아래 STEP2가 전부 삭제).
--       crawl_logs.source_id 도 SET NULL → 로그는 보존되고 source 참조만 끊긴다.
-- DB 구조 변경 없음(데이터 삭제만).

-- ── STEP 0: 현황 확인 (삭제 전 건수 파악) ─────────────────────────────────
select count(*) as 유튜브영상_총건수 from public.youtube_videos;

select s.id, s.name, s.is_active, count(v.id) as 영상수
from public.sources s
left join public.youtube_videos v on v.source_id = s.id
where s.type = 'youtube_channel'
group by s.id, s.name, s.is_active
order by s.name;

-- ── STEP 1: 유튜브 영상 전체 삭제 ─────────────────────────────────────────
-- (북마크 등 FK 는 schema 상 cascade/set null 로 처리됨. 전량 삭제로 클린 슬레이트.)
delete from public.youtube_videos;

-- ── STEP 2: 무관 유튜브 채널 소스 삭제 ────────────────────────────────────
-- 옵션 A) 모든 youtube_channel 소스 삭제 (B 재설계는 채널 소스를 쓰지 않음 → 기본 권장)
delete from public.sources where type = 'youtube_channel';

-- 옵션 B) 특정 채널만 남기고 싶다면 위 A 대신 아래처럼 id 지정 삭제:
-- delete from public.sources where type = 'youtube_channel' and id in ('<source_id_1>', '<source_id_2>');

-- ── STEP 3: 검증 ─────────────────────────────────────────────────────────
select count(*) as 남은_유튜브영상 from public.youtube_videos;            -- 0 기대
select count(*) as 남은_유튜브채널소스 from public.sources where type = 'youtube_channel'; -- 0 기대(옵션 A)
