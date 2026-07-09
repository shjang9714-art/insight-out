-- 253 큐레이션 통합 — curated_groups + curated_companies(41개사) + llm_prompts
-- 핸드오프: 수희 → Supabase SQL Editor. 전체 붙여넣고 RUN(한 번에).
-- 목적: 기업동향 2탭(주요 기업 7그룹 / 경쟁사 동향 5그룹)의 단일 데이터원.
--   회사는 다중 그룹 소속(groups[]), 이름 불일치는 aliases[]로 매칭. 246 엔티티 태깅 대체.
-- 설계: docs/설계-경쟁사동향-큐레이션.md, docs/설계-관심기업-큐레이션-재구상.md

begin;

-- ── 1. 그룹 정의 (경쟁사 5 + 관심기업/주요기업 7) ────────────────────────────
create table if not exists public.curated_groups (
  key          text primary key,
  label        text not null,
  kind         text not null check (kind in ('competitor', 'watchlist')),
  display_mode text not null default 'always' check (display_mode in ('always', 'on_issue')),
  sort_order   int  not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

insert into public.curated_groups (key, label, kind, display_mode, sort_order) values
  -- 경쟁사 동향 5그룹
  ('cp_telecom',  '통신 B2B 경쟁',       'competitor', 'always',   1),
  ('cp_aidc',     'AIDC·IDC 경쟁',       'competitor', 'always',   2),
  ('cp_cloud',    '클라우드·AI 플랫폼 경쟁','competitor', 'on_issue', 3),
  ('cp_sidx',     'SI·DX 경쟁',          'competitor', 'on_issue', 4),
  ('cp_security', '보안 경쟁',           'competitor', 'on_issue', 5),
  -- 주요 기업 7그룹
  ('wl_telecom',  '통신·B2B 경쟁사',      'watchlist',  'always',   1),
  ('wl_cloud',    '국내 클라우드·IDC·AIDC','watchlist',  'always',   2),
  ('wl_sidx',     'SI·DX·MSP',           'watchlist',  'always',   3),
  ('wl_global',   '글로벌 AI·클라우드·GPU','watchlist',  'always',   4),
  ('wl_security', '보안·제로트러스트·PQC', 'watchlist',  'always',   5),
  ('wl_mfg',      '제조·모빌리티 핵심고객','watchlist',  'always',   6),
  ('wl_fin',      '금융·유통·플랫폼 핵심고객','watchlist','always',  7)
on conflict (key) do update set
  label = excluded.label, kind = excluded.kind,
  display_mode = excluded.display_mode, sort_order = excluded.sort_order;

-- ── 2. 큐레이션 회사 (41개사, 다중 그룹·별칭) ────────────────────────────────
create table if not exists public.curated_companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  aliases       text[] not null default '{}',   -- 기사 매칭·엔티티 연결(예: SKT)
  groups        text[] not null default '{}',   -- curated_groups.key 다중
  is_competitor boolean not null default false,
  entity_id     uuid references public.entities (id) on delete set null,
  role          text,
  sort_order    int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists curated_companies_groups_idx on public.curated_companies using gin (groups);
create index if not exists curated_companies_competitor_idx on public.curated_companies (is_competitor) where is_competitor;

insert into public.curated_companies (name, aliases, groups, is_competitor, role) values
  -- 통신 경쟁사
  ('KT',          array['KT']::text[],                          array['wl_telecom','cp_telecom'],                  true,  '통신 B2B 직접 경쟁'),
  ('SK텔레콤',    array['SKT','SK Telecom','에스케이텔레콤'],   array['wl_telecom','cp_telecom'],                  true,  '통신 B2B 직접 경쟁'),
  ('SK브로드밴드',array['SKB','SK Broadband'],                  array['wl_telecom','cp_telecom','cp_aidc'],        true,  '통신·IDC 경쟁'),
  -- 국내 클라우드·IDC·AIDC
  ('KT클라우드',  array['KT Cloud','kt cloud'],                 array['wl_cloud','cp_aidc'],                       true,  'AIDC·IDC 경쟁'),
  ('네이버클라우드',array['NCP','Naver Cloud','네이버 클라우드'],array['wl_cloud','cp_aidc','cp_cloud'],           true,  '클라우드·AIDC 경쟁'),
  ('NHN Cloud',   array['NHN클라우드','엔에이치엔 클라우드'],   array['wl_cloud'],                                 false, '국내 클라우드'),
  ('카카오엔터프라이즈',array['Kakao Enterprise'],              array['wl_cloud'],                                 false, '국내 클라우드·플랫폼'),
  ('삼성SDS',     array['Samsung SDS','삼성에스디에스'],        array['wl_cloud','wl_sidx','cp_aidc','cp_sidx'],   true,  'IDC·SI·DX 경쟁'),
  -- SI·DX·MSP
  ('LG CNS',      array['엘지씨엔에스'],                        array['wl_cloud','wl_sidx','cp_sidx'],             true,  'SI·DX 경쟁'),
  ('SK AX',       array['SK C&C','SKC&C','에스케이에이엑스'],   array['wl_sidx','cp_sidx'],                        true,  'SI·DX 경쟁'),
  ('현대오토에버',array['Hyundai AutoEver'],                    array['wl_sidx','cp_sidx'],                        true,  'SI·DX 경쟁'),
  ('포스코DX',    array['POSCO DX','포스코디엑스'],             array['wl_sidx'],                                  false, 'SI·DX'),
  ('메가존클라우드',array['Megazone Cloud','메가존'],           array['wl_sidx'],                                  false, 'MSP'),
  -- 글로벌 AI·클라우드·GPU
  ('AWS',         array['Amazon Web Services','아마존웹서비스'],array['wl_global','cp_cloud'],                    true,  '글로벌 클라우드 경쟁'),
  ('Microsoft',   array['MS','Azure','마이크로소프트'],         array['wl_global','cp_cloud'],                    true,  '글로벌 클라우드·AI 경쟁'),
  ('Google Cloud',array['Google','GCP','구글클라우드','구글'],  array['wl_global','cp_cloud'],                    true,  '글로벌 클라우드·AI 경쟁'),
  ('Oracle',      array['오라클'],                              array['wl_global'],                                false, '글로벌 클라우드'),
  ('NVIDIA',      array['엔비디아'],                            array['wl_global'],                                false, 'GPU·AI 인프라'),
  ('OpenAI',      array['오픈AI','오픈에이아이'],               array['wl_global'],                                false, 'LLM 생태계'),
  ('Anthropic',   array['앤트로픽'],                            array['wl_global'],                                false, 'LLM 생태계'),
  -- 보안
  ('SK쉴더스',    array['SK Shieldus','에스케이쉴더스'],        array['wl_security','cp_security'],                true,  '보안·관제 경쟁'),
  ('안랩',        array['AhnLab'],                              array['wl_security','cp_security'],                true,  '보안 경쟁'),
  ('지니언스',    array['Genians'],                             array['wl_security','cp_security'],                true,  'ZTNA·보안 경쟁'),
  ('시큐아이',    array['SECUI'],                               array['wl_security'],                              false, '보안'),
  ('Palo Alto Networks',array['Palo Alto','팔로알토'],         array['wl_security','cp_security'],                true,  'SASE·보안 경쟁'),
  -- 제조·모빌리티 핵심고객
  ('현대자동차',  array['Hyundai Motor','현대차'],              array['wl_mfg'],                                   false, '핵심고객(전용망·스마트팩토리)'),
  ('기아',        array['Kia','기아차'],                        array['wl_mfg'],                                   false, '핵심고객'),
  ('삼성전자',    array['Samsung Electronics','삼성'],          array['wl_mfg'],                                   false, '핵심고객(AIDC·반도체)'),
  ('SK하이닉스',  array['SK hynix','하이닉스'],                 array['wl_mfg'],                                   false, '핵심고객(반도체)'),
  ('LG전자',      array['LG Electronics'],                      array['wl_mfg'],                                   false, '핵심고객'),
  ('LG에너지솔루션',array['LG Energy Solution','LG엔솔'],       array['wl_mfg'],                                   false, '핵심고객'),
  ('포스코',      array['POSCO'],                               array['wl_mfg'],                                   false, '핵심고객(스마트팩토리)'),
  -- 금융·유통·플랫폼 핵심고객
  ('신한금융',    array['신한','신한금융지주','Shinhan'],       array['wl_fin'],                                   false, '핵심고객(AICC·보안)'),
  ('KB금융',      array['KB','국민은행','KB금융지주'],          array['wl_fin'],                                   false, '핵심고객'),
  ('하나금융',    array['하나','하나금융지주','하나은행'],       array['wl_fin'],                                   false, '핵심고객'),
  ('삼성화재',    array['Samsung Fire'],                        array['wl_fin'],                                   false, '핵심고객'),
  ('쿠팡',        array['Coupang'],                             array['wl_fin'],                                   false, '핵심고객(클라우드·물류)'),
  ('네이버',      array['Naver','NAVER'],                       array['wl_fin'],                                   false, '핵심고객·플랫폼'),
  ('카카오',      array['Kakao'],                               array['wl_fin'],                                   false, '핵심고객·플랫폼'),
  ('우아한형제들',array['배달의민족','배민','Woowahan'],        array['wl_fin'],                                   false, '핵심고객(AICC)')
on conflict (name) do update set
  aliases = excluded.aliases, groups = excluded.groups,
  is_competitor = excluded.is_competitor, role = excluded.role;

-- 기존 entities 연결(있으면 entity_id 채움 — 이름/별칭 매칭)
update public.curated_companies cc
set entity_id = e.id
from public.entities e
where cc.entity_id is null
  and e.entity_type = 'company'
  and (lower(e.canonical_name) = lower(cc.name)
       or lower(e.canonical_name) = any (select lower(a) from unnest(cc.aliases) a));

-- ── 3. llm_prompts — 어드민 편집 프롬프트 (company_insight 한글 강제) ──────────
create table if not exists public.llm_prompts (
  key         text primary key,
  label       text,
  prompt_text text not null,
  updated_at  timestamptz not null default now()
);

insert into public.llm_prompts (key, label, prompt_text) values
  ('company_insight', '주요기업 동향 분석(회사별 insight_cards)',
$prompt$당신은 LG U+ B2B 시장 인텔리전스 분석가다. 주어진 한 기업 관련 최근 기사들을 종합해 그 기업의 최근 동향을 LG U+ 관점에서 분석하라.
**반드시 한국어로만 작성한다. 영어 문장·영어 단어 나열 금지(고유명사 제외).**
출력(JSON):
- card_headline: 읽고 싶게 만드는 에디토리얼 헤드라인(공백 포함 24자 내외, 구체 수치·주체·변화폭, 사실 기반, 낚시·물음표 남용 금지).
- headline: 분석가 톤의 핵심 동향 1줄.
- implication: LG U+ B2B 관점 시사점 3~4문장 — ①왜 중요한지(경쟁/협력/위협) ②기회/리스크 ③사업·행동 연결점. 구체적으로, 입력 기사 근거 밖 단정 금지.
- citations: 각 핵심 주장마다 입력 기사의 15단어 이내 인용 + content_id. 3건 이상 권장.
JSON만 출력.$prompt$)
on conflict (key) do update set
  label = excluded.label, prompt_text = excluded.prompt_text, updated_at = now();

commit;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
select kind, count(*) from public.curated_groups group by kind order by 1;
select count(*) as companies, count(*) filter (where is_competitor) as competitors
from public.curated_companies;
select count(*) filter (where entity_id is not null) as linked_to_entities from public.curated_companies;
-- 그룹별 회사 수(경쟁사)
select g.key, g.label, count(c.*) as cnt
from public.curated_groups g
left join public.curated_companies c on g.key = any(c.groups)
where g.kind = 'competitor'
group by g.key, g.label, g.sort_order order by g.sort_order;
