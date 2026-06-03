-- ============================================================
-- 서비스별 키워드 seed (#24 콘텐츠↔서비스 태깅 기준 데이터) — 2026-06-03
-- 실행: 수희 (Supabase SQL Editor)
-- 용도: 크롤러가 적재 후 이 키워드를 제목/본문에 매칭해 content_keywords +
--       content_services 를 자동 태깅 → "담당 서비스별 큐레이션"(#18 필터) 작동.
-- 주의:
--   - keywords 는 lower(name) 유니크(keywords_name_key) → 키워드명 전역 고유.
--     같은 단어를 두 서비스에 넣지 않음(가장 적합한 1개 서비스에 배정).
--   - service_id 는 name 으로 조회(시드 UUID 가 동적이므로).
--   - 멱등: 이미 있는 이름은 not exists 로 건너뜀 → 재실행 안전.
--   - 초기 seed. 정교화·추가·수정은 어드민 "키워드 관리"(#키워드관리, Phase 2-C)에서.
-- ============================================================

begin;

insert into public.keywords (name, service_id)
select v.name, s.id
from (values
  -- Connectivity (유선 연결·기업통신)
  ('전용회선','Connectivity'), ('기업인터넷','Connectivity'), ('국제전용회선','Connectivity'),
  ('SD-WAN','Connectivity'), ('MPLS','Connectivity'), ('인터넷전화','Connectivity'), ('기업통신','Connectivity'),
  -- 보안/클라우드
  ('클라우드','보안/클라우드'), ('정보보안','보안/클라우드'), ('제로트러스트','보안/클라우드'),
  ('방화벽','보안/클라우드'), ('MSP','보안/클라우드'), ('DDoS','보안/클라우드'),
  ('클라우드보안','보안/클라우드'), ('정보보호','보안/클라우드'),
  -- M2M (IoT)
  ('IoT','M2M'), ('사물인터넷','M2M'), ('스마트팩토리','M2M'), ('NB-IoT','M2M'),
  ('LPWA','M2M'), ('원격관제','M2M'), ('산업용IoT','M2M'),
  -- AICC (AI 컨택센터)
  ('AICC','AICC'), ('컨택센터','AICC'), ('콜센터','AICC'), ('챗봇','AICC'),
  ('음성봇','AICC'), ('상담봇','AICC'), ('고객센터','AICC'),
  -- AIDC (AI 데이터센터)
  ('AIDC','AIDC'), ('데이터센터','AIDC'), ('GPU','AIDC'), ('AI인프라','AIDC'),
  ('코로케이션','AIDC'), ('서버랙','AIDC'),
  -- 모빌리티
  ('모빌리티','모빌리티'), ('차량관제','모빌리티'), ('텔레매틱스','모빌리티'),
  ('커넥티드카','모빌리티'), ('자율주행','모빌리티'), ('스마트물류','모빌리티'),
  -- 기업솔루션
  ('스마트워크','기업솔루션'), ('협업툴','기업솔루션'), ('업무자동화','기업솔루션'),
  ('RPA','기업솔루션'), ('그룹웨어','기업솔루션'), ('생성형AI','기업솔루션')
) as v(name, svc)
join public.services s on s.name = v.svc
where not exists (
  select 1 from public.keywords k where lower(k.name) = lower(v.name)
);

commit;

-- 확인용:
-- select s.name 서비스, count(*) 키워드수 from keywords k join services s on s.id=k.service_id group by s.name order by s.name;
