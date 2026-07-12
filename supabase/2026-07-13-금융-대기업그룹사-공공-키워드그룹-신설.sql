-- ============================================================
-- 금융 / 대기업그룹사 / 공공 keyword_groups 신설 (초안)
-- 지시서: 지시서_20260713b_맞춤피드-희소카테고리-무관기사백필.md §3 STEP 1-3
-- 배경: 맞춤피드 관심 카테고리(금융/대기업그룹사/공공)를 단독 선택하면
--   personalized 후보가 0건이라 도메인과 무관한 트렌딩 기사로 채워지는 문제.
--   원인은 크롤링 콘텐츠 부재가 아니라, 이 3개 도메인에 대응하는
--   keyword_groups 행 자체가 없어서 매칭이 안 되는 것(§0-5 확인 완료).
-- 실행: 수희 (Supabase 대시보드 → SQL Editor) — Claude Code는 실행하지 않음.
-- 이 파일은 STEP 1~3(그룹 신설)만 포함. 기존 콘텐츠 재태깅 백필은
--   이 SQL 실행 확인 후 별도 스크립트(터미널)로 진행(지시서 §3 STEP 5).
-- ============================================================

-- ┌─────────────────────────────────────────────────────────┐
-- │ STEP 1. 금융                                              │
-- └─────────────────────────────────────────────────────────┘
insert into public.keyword_groups
  (name, kind, tag_type, description, include_patterns, exclude_patterns, weight, signal_hint, search_seeds, is_active)
select
  '금융',
  'finance',
  'industry',
  'LGU+ B2B 잠재 고객 관점의 금융업권 동향 — 금융지주·은행·보험·카드·증권사',
  array[
    'KB', '신한', '하나은행', '우리은행', 'NH농협', 'IBK기업은행',
    '카카오뱅크', '토스뱅크', '케이뱅크',
    '삼성생명', '한화생명', '교보생명', '삼성화재', 'DB손해보험', '현대해상',
    '미래에셋',
    '금융지주', '시중은행', '보험사', '증권사', '핀테크', '디지털금융', '오픈뱅킹'
  ],
  '{}',
  1.0,
  null,
  '{}',
  true
where not exists (
  select 1 from public.keyword_groups where kind = 'finance'
);

-- ┌─────────────────────────────────────────────────────────┐
-- │ STEP 2. 대기업그룹사                                       │
-- │  주의: '삼성전자'/'SK그룹' 등은 'AI 기술'/'AIDC' 그룹의       │
-- │  include_patterns(삼성반도체·sk하이닉스 등)와 일부 겹칠 수    │
-- │  있음 — matched_groups/matched_keywords는 배열이라 한 기사가  │
-- │  여러 그룹에 동시 태깅되는 것이 정상 동작(matchKeywordGroups  │
-- │  는 OR 매칭, 그룹 배타적 선택 아님). 의도된 중복이므로 문제없음.│
-- └─────────────────────────────────────────────────────────┘
insert into public.keyword_groups
  (name, kind, tag_type, description, include_patterns, exclude_patterns, weight, signal_hint, search_seeds, is_active)
select
  '대기업그룹사',
  'major_group',
  'company',
  'LGU+ B2B 잠재 고객 관점의 대기업집단 동향 — 삼성/SK/현대차/LG 등 주요 그룹사',
  array[
    '삼성전자', '삼성그룹', 'SK그룹', 'SK이노베이션',
    '현대차그룹', '현대자동차그룹', 'LG그룹', 'LG전자',
    '롯데그룹', '한화그룹', 'GS그룹', 'HD현대', '현대중공업',
    '포스코', '신세계그룹', 'CJ그룹', '두산그룹', 'DL이앤씨',
    '효성그룹', '코오롱그룹', '한진그룹'
  ],
  '{}',
  1.0,
  null,
  '{}',
  true
where not exists (
  select 1 from public.keyword_groups where kind = 'major_group'
);

-- ┌─────────────────────────────────────────────────────────┐
-- │ STEP 3. 공공                                               │
-- │  기존 'gov_reg'/'gov_business' 그룹(정부 규제/정부 사업)보다   │
-- │  넓은 범위 — 정책 주제가 아니라 "공공 부문 자체"를 다루는       │
-- │  일반 기사(부처·지자체·공공기관 동향)를 잡기 위한 신규 그룹.    │
-- └─────────────────────────────────────────────────────────┘
insert into public.keyword_groups
  (name, kind, tag_type, description, include_patterns, exclude_patterns, weight, signal_hint, search_seeds, is_active)
select
  '공공',
  'public_sector',
  'industry',
  'LGU+ B2B 잠재 고객 관점의 공공 부문 동향 — 정부부처·지자체·공공기관',
  array[
    '기획재정부', '과학기술정보통신부', '과기정통부', '행정안전부',
    '산업통상자원부', '국토교통부', '보건복지부', '교육부',
    '서울시', '경기도',
    '한국전력공사', '한국도로공사', '국민건강보험공단', '조달청',
    '지방자치단체', '공공기관'
  ],
  '{}',
  1.0,
  null,
  '{}',
  true
where not exists (
  select 1 from public.keyword_groups where kind = 'public_sector'
);

-- ┌─────────────────────────────────────────────────────────┐
-- │ STEP 4. 신설 확인                                          │
-- └─────────────────────────────────────────────────────────┘
select id, name, kind, tag_type, include_patterns, is_active
from public.keyword_groups
where kind in ('finance', 'major_group', 'public_sector');
