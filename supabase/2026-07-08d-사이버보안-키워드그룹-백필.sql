-- ============================================================
-- 사이버보안 keyword_group 신설 + 7일 창 백필 리태깅
-- 지시서: "주목하세요, 핵심 Insight" §3-1 버킷팅 — 사이버보안(가이드 §1의 4번)
--         카테고리에 매칭되는 keyword_groups 행이 없어서 신설.
-- 실행: 수희 (Supabase 대시보드 → SQL Editor)
-- 대상 테이블: 기존 public.keyword_groups / public.contents 에 대한
--   INSERT·UPDATE(행 추가/컬럼 갱신)라 신규 GRANT 불필요(테이블 권한 상속).
-- ============================================================

-- ┌─────────────────────────────────────────────────────────┐
-- │ STEP 1. keyword_groups 에 cybersecurity 그룹 신설         │
-- │  (kind에 unique 제약 없음 → not exists 가드로 멱등 처리)  │
-- └─────────────────────────────────────────────────────────┘
insert into public.keyword_groups
  (name, kind, tag_type, description, include_patterns, exclude_patterns, weight, signal_hint, search_seeds, is_active)
select
  '사이버보안',
  'cybersecurity',
  'tech',
  '기업보안·위협대응·데이터주권 — MDR/XDR/SASE/ZTNA/SECaaS 등 B2B 보안 솔루션·사고·규제',
  array[
    'MDR', 'XDR', 'EDR', 'SASE', 'ZTNA', 'SOC',
    'SECaaS', '제로트러스트', '침해사고', '랜섬웨어', '피싱',
    '정보유출', '보안관제', '취약점', '데이터주권', '수출통제'
  ],
  '{}',
  1.0,
  null,
  '{}',
  true
where not exists (
  select 1 from public.keyword_groups where kind = 'cybersecurity'
);

-- ┌─────────────────────────────────────────────────────────┐
-- │ STEP 2. 7일 창 contents 백필 리태깅 (append-only)         │
-- │  - title + summary_ko + body_original 대상, 프로덕션      │
-- │    matchKeywordGroups()의 patternHit 규칙과 동일:          │
-- │    영숫자 4자 이하 패턴(MDR/XDR/EDR/SASE/ZTNA/SOC)은        │
-- │    단어경계(\m…\M), 그 외(한글·SECaaS)는 부분일치.          │
-- │  - 기존 matched_groups/matched_keywords는 절대 덮어쓰지     │
-- │    않고 append만 한다(다른 그룹 태그 보존).                 │
-- └─────────────────────────────────────────────────────────┘
begin;

with patterns(pattern, is_short) as (
  values
    ('MDR', true), ('XDR', true), ('EDR', true),
    ('SASE', true), ('ZTNA', true), ('SOC', true),
    ('SECaaS', false),
    ('제로트러스트', false), ('침해사고', false), ('랜섬웨어', false),
    ('피싱', false), ('정보유출', false), ('보안관제', false),
    ('취약점', false), ('데이터주권', false), ('수출통제', false)
),
target as (
  select
    id, matched_groups, matched_keywords,
    (title || ' ' || coalesce(summary_ko, '') || ' ' || coalesce(body_original, '')) as haystack
  from public.contents
  where status = 'published'
    and (
      published_at >= now() - interval '7 days'
      or (published_at is null and collected_at >= now() - interval '7 days')
    )
),
hits as (
  select
    t.id, t.matched_groups, t.matched_keywords,
    array_agg(distinct p.pattern) as hit_keywords
  from target t
  join patterns p
    on case
         when p.is_short then t.haystack ~* ('\m' || p.pattern || '\M')
         else t.haystack ilike ('%' || p.pattern || '%')
       end
  group by t.id, t.matched_groups, t.matched_keywords
)
update public.contents c
set
  matched_groups = case
    when '사이버보안' = any(c.matched_groups) then c.matched_groups
    else c.matched_groups || array['사이버보안']
  end,
  matched_keywords = (
    select array(select distinct unnest(c.matched_keywords || h.hit_keywords))
  )
from hits h
where c.id = h.id;

commit;

-- ┌─────────────────────────────────────────────────────────┐
-- │ STEP 3. 검증 — 백필 후 사이버보안 태그 건수                │
-- └─────────────────────────────────────────────────────────┘

-- 3-1. 그룹 생성 확인
select id, name, kind, tag_type, include_patterns, is_active
from public.keyword_groups
where kind = 'cybersecurity';

-- 3-2. 7일 창 내 '사이버보안' 태그 건수 (raw, status=published)
select count(*) as security_tagged_raw
from public.contents
where status = 'published'
  and '사이버보안' = any(matched_groups)
  and (
    published_at >= now() - interval '7 days'
    or (published_at is null and collected_at >= now() - interval '7 days')
  );

-- 3-3. 매칭된 기사 목록(제목 + 히트 키워드) — 오탐 육안 확인용
select id, title, matched_keywords, published_at, collected_at
from public.contents
where status = 'published'
  and '사이버보안' = any(matched_groups)
  and (
    published_at >= now() - interval '7 days'
    or (published_at is null and collected_at >= now() - interval '7 days')
  )
order by coalesce(published_at, collected_at::date) desc;
