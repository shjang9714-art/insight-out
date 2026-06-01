-- ============================================================
-- 서비스 시드 교체 (BL-1) — 2026-06-01
-- placeholder 8개(STAGE/BizWork/…) → 실제 LG U+ B2B 서비스 7개
-- 실행: 수희 (Supabase SQL Editor)
-- ------------------------------------------------------------
-- ⚠️ 주의: services 삭제 시 FK on delete cascade 로
--   user_services / content_services 행도 함께 삭제됩니다.
--   (개발 단계 placeholder 선택분이므로 폐기해도 무방. 온보딩에서 재선택)
-- 재실행 안전: delete 후 insert 라 몇 번 돌려도 최종 상태 동일.
-- ============================================================

begin;

delete from public.services;

insert into public.services (name, description, icon, "order") values
  ('Connectivity', '기업 전용회선·인터넷 등 유선 연결 서비스',     '🔗', 1),
  ('보안/클라우드', '기업 보안 및 클라우드 인프라 서비스',          '☁️', 2),
  ('M2M',          '사물지능통신(IoT) 회선·플랫폼',               '📡', 3),
  ('AICC',         'AI 컨택센터(AI Contact Center) 솔루션',       '🎧', 4),
  ('AIDC',         'AI 데이터센터(AI Data Center)',               '🖥️', 5),
  ('모빌리티',      '차량관제·물류 등 모빌리티 솔루션',             '🚗', 6),
  ('기업솔루션',    '스마트워크·업무 자동화 등 기업 솔루션',         '🏢', 7);

commit;
