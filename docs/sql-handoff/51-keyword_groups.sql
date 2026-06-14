-- 지시서 51 (묶음 B-1) — keyword_groups + trust_tier + importance_score
-- 수희가 Supabase SQL Editor에서 실행. ALTER TYPE ADD VALUE 없으므로 단일 트랜잭션 가능.

-- 1) tag_type enum (keyword_groups.tag_type 용. B3에서 keywords에도 사용)
create type tag_type as enum ('industry', 'company', 'tech', 'market', 'policy', 'content_type');

-- 2) keyword_groups 테이블
create table public.keyword_groups (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,                 -- 표시명 (예: 경쟁사)
  kind             text not null,                 -- slug (예: competitor) — admin 추가 자유(enum 아님)
  tag_type         tag_type not null default 'industry',
  description      text,
  include_patterns text[] not null default '{}',  -- 매칭(점수↑·태그)
  exclude_patterns text[] not null default '{}',  -- 매칭 시 도메인무관 하드 reject
  weight           numeric not null default 1.0,
  signal_hint      text,                          -- (B4 연계용, nullable)
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger set_keyword_groups_updated_at
  before update on public.keyword_groups
  for each row execute function public.set_updated_at();

-- RLS: 읽기 = 인증 사용자, 쓰기 = admin 전용
alter table public.keyword_groups enable row level security;

create policy "keyword_groups: 인증 조회" on public.keyword_groups
  for select using (auth.uid() is not null);

create policy "keyword_groups: admin 전체" on public.keyword_groups
  for all using (public.is_admin()) with check (public.is_admin());

-- 3) sources.trust_tier (0=광역/엄격, 1=기본, 2=신뢰/게이트면제)
alter table public.sources
  add column trust_tier smallint not null default 1;

-- 4) contents.importance_score (0~1, 결정적 관련도 시작값)
alter table public.contents
  add column importance_score numeric not null default 0;

-- 5) 16그룹 시드 (include/weight/tag_type)
insert into public.keyword_groups (name, kind, tag_type, include_patterns, weight) values
  ('경쟁사',       'competitor',        'company',  array['SKT','KT','SK브로드밴드','세종텔레콤','네이버클라우드','카카오엔터프라이즈','NHN Cloud'], 1.2),
  ('빅테크',       'bigtech',           'company',  array['AWS','Microsoft','Azure','Google Cloud','Oracle','NVIDIA','OpenAI','Salesforce','ServiceNow'], 1.0),
  ('AI 기술',      'ai_tech',           'tech',     array['생성형 AI','AI Agent','Enterprise AI','Copilot','LLM','RAG','sovereign AI','AI 인프라'], 1.0),
  ('AICC',         'aicc',              'tech',     array['AI 컨택센터','AICC','콜센터 AI','상담봇','음성봇'], 1.1),
  ('AIDC',         'aidc',              'tech',     array['데이터센터','AI 데이터센터','IDC','GPU 클라우드','코로케이션'], 1.1),
  ('통신 B2B',     'telecom_b2b',       'industry', array['5G 특화망','Private 5G','네트워크 슬라이싱','MEC','전용회선','M2M'], 1.1),
  ('모빌리티',     'mobility',          'industry', array['차량관제','커넥티드카','V2X','자율주행','텔레매틱스'], 1.0),
  ('CCTV·영상보안','cctv',              'industry', array['CCTV','영상관제','지능형 관제','VMS','영상분석'], 1.0),
  ('SME 솔루션',   'sme_solution',      'industry', array['소상공인','중소기업 솔루션','POS','기업솔루션','SaaS 구독'], 1.0),
  ('피지컬 AI',    'physical_ai',       'tech',     array['피지컬 AI','로봇','휴머노이드','임베디드 AI','엣지 AI'], 0.9),
  ('정부 규제',    'gov_reg',           'policy',   array['AI 기본법','개인정보보호법','클라우드보안인증','망 이용대가','전파법'], 1.0),
  ('정부 사업',    'gov_business',      'policy',   array['공공 SaaS','디지털플랫폼정부','사업공고','조달','국가 R&D','실증사업'], 1.0),
  ('제조 DX',      'manufacturing_dx',  'industry', array['스마트팩토리','MES','OT 보안','예지보전','디지털 트윈','산업 AI'], 1.0),
  ('IT 동향',      'it_trend',          'industry', array['클라우드','SaaS','사이버보안','DX','플랫폼'], 0.8),
  ('에너지',       'energy',            'industry', array['RE100','PPA','VPP','REC','재생에너지'], 0.8),
  ('ESG',          'esg',               'industry', array['ESG','탄소배출','Scope 3','지속가능경영','탄소중립'], 0.8);

-- 노이즈 제외 그룹 (weight=0, exclude_patterns로 도메인무관 하드 reject)
-- ※ 부분일치 매칭이라 49의 negative-lookahead 대신 구체 문자열 사용.
--   '프로축구' 단독 미포함(오탐 방지) → '프로축구' 포함 B2B 기사(후원 협약 등)는 통과.
insert into public.keyword_groups (name, kind, tag_type, weight, exclude_patterns) values
  ('노이즈 제외', '_noise', 'industry', 0,
   array['연예','아이돌','걸그룹','보이그룹','열애설','프로야구','KBO','K리그','골프 대회',
         '아파트 분양','청약 경쟁률','전세사기','오늘의 운세','로또','복권 당첨','주간 날씨']);
