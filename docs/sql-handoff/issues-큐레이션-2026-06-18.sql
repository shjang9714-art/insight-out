-- ============================================================
-- 이슈 큐레이션 (Claude/Opus 추출) — 2026-06-18 최근 14일 코퍼스 기반
-- 수희 실행: Supabase SQL Editor. 101-issues.sql 적용 후.
-- 방식: issues 12건 INSERT(status='published', source='claude') →
--       match_keywords ILIKE(제목) 백필로 issue_contents 자동 배정.
-- 멱등: title 기준 충돌 방지 위해 기존 동일 title 이슈는 건너뜀(아래 not exists).
-- 향후 신규 콘텐츠는 크롤러(101)가 같은 match_keywords로 자동 배정.
-- ============================================================

insert into public.issues (title, summary, status, match_keywords, source)
select v.title, v.summary, 'published'::issue_status, v.match_keywords, 'claude'
from (values
  (
    'AI 데이터센터 구축 경쟁',
    '통신사·전력기업·건설사까지 AI 데이터센터(AIDC) 구축에 대거 진입. 전력·냉각·입지가 칩보다 어려운 승부처로 부상.',
    array['AI 데이터센터','AI데이터센터']
  ),
  (
    'AIDC 특별법·정부 데이터센터 정책',
    '정부가 AI 데이터센터 특별법 하위법령·지방 분산·인허가 완화로 정책 드라이브. 비수도권 특구·전력 안정화가 쟁점.',
    array['AIDC 특별법','AI 데이터센터 특별법','하위법령','지방 분산','지방에','AIDC법','특별법']
  ),
  (
    'AI 데이터센터 전력·냉각 기술',
    'AIDC 전력 폭증으로 액체냉각·전력 인프라가 핵심 경쟁력. KAIST 냉각 기술, SMR 등 에너지 해법 부상.',
    array['냉각','전력난','전력 안정화','SMR','광모듈','광검출기','냉각배관']
  ),
  (
    '통신3사 AI 인프라 경쟁',
    'SKT-엔비디아 AI 팩토리 등 통신사가 통신을 넘어 AI 인프라 사업자로 전환. AI G3 도약에 통신 인프라 투자 부각.',
    array['AI 팩토리','통신3사','통신 3사','통신사 적극','AI 고속도로','AI 인프라로','AI 인프라 사업']
  ),
  (
    'KT 부울경 AX 거점 공략',
    'KT가 부산 클라우드 데이를 열고 부울경을 제조·물류 현장형 AX 거점으로 집중 공략.',
    array['부울경','부산 클라우드 데이','현장형 AX']
  ),
  (
    'SKT AX 혁신 2.0 — AI를 구성원으로',
    'SKT가 AI에 사번을 부여하고 AI 에이전트와 협업하는 일하는 방식 재설계(AX 혁신 2.0)를 추진.',
    array['AX 혁신 2.0','사번','AI 에이전트와 협업','A.X K2']
  ),
  (
    'SKT·경찰청 AI 보이스피싱 차단',
    'SKT-경찰청 AI 공조로 3개월간 범죄 서버 475개 식별, 약 1638억원 피해 예방. 통신·금융사기 대응체계 고도화.',
    array['보이스피싱','경찰청','범죄 서버','통신·금융사기','금융사기 대응']
  ),
  (
    '앤트로픽 수출통제·한국 AI 주권',
    '앤트로픽 수출통제(미토스·페이블 차단)가 한국 AI 인프라·주권 전략의 시험대. 과기정통부-앤트로픽 안전·보안 협약도 추진.',
    array['앤트로픽','수출통제','AI 주권','미토스','페이블','단일 AI 모델']
  ),
  (
    '기업용 AI 에이전트 확산',
    'AI가 도구에서 업무 수행 동료로. MS 코파일럿 코워크, KT 버티컬 AI 에이전트 등 기업 도입 본격화와 에이전트 보안이 화두.',
    array['AI 에이전트','에이전틱','코파일럿','버티컬 AI','agentic']
  ),
  (
    '금융권 AI·AX 규율',
    '금융당국 AI 7대 원칙·망분리 완화로 금융 AX 가속. 증권·은행권 AI 인재 확보 경쟁과 감독체계 재편.',
    array['금융 AI','금융권','증권가 AI','망분리','7대 원칙','금융사기']
  ),
  (
    '피지컬 AI·로봇',
    'AI가 로봇·자동차·선박 등 물리 세계로 확장. 두산로보틱스-엔비디아, LG전자 등 피지컬 AI·휴머노이드 경쟁.',
    array['피지컬 AI','휴머노이드','로봇']
  ),
  (
    '국가AI컴퓨팅센터·GPU 클라우드',
    '국가AI컴퓨팅센터 출범(초대 대표 삼성SDS 안정태). 국가 AI데이터센터 GPU 클라우드 공급 경쟁(엘리스그룹 등).',
    array['국가AI컴퓨팅센터','국가 AI데이터센터','국가 AI 데이터센터','AICA','GPU 클라우드']
  )
) as v(title, summary, match_keywords)
where not exists (
  select 1 from public.issues e where lower(e.title) = lower(v.title)
);

-- 콘텐츠 자동 배정 (match_keywords ILIKE 제목 — summary_ko 는 현재 null)
insert into public.issue_contents (issue_id, content_id, source)
select i.id, c.id, 'rule'
from public.issues i
join public.contents c
  on c.status = 'published'
 and exists (
   select 1 from unnest(i.match_keywords) kw
   where c.title ilike '%' || kw || '%'
      or coalesce(c.summary_ko, '') ilike '%' || kw || '%'
 )
on conflict (issue_id, content_id) do nothing;

-- 검증
select i.title, count(ic.content_id) as 배정건수
from public.issues i
left join public.issue_contents ic on ic.issue_id = i.id
group by i.title
order by 배정건수 desc;
