-- ============================================================
-- 핸드오프 114 — 샘플 전략보고서 시드 (Opus/Claude 작성)
-- 수희 실행: Supabase SQL Editor. ai_reports/ai_report_sources 존재 전제(기존 스키마).
-- user_id = David(yjhead@gmail.com). per-user RLS 라 David 에게 노출.
-- body_md 는 dollar-quote($md$…$md$) 로 이스케이프 불필요.
-- 멱등: 동일 제목 보고서 있으면 건너뜀.
-- ============================================================

with existing as (
  select r.id
  from public.ai_reports r
  join public.users u on u.id = r.user_id
  where u.email = 'yjhead@gmail.com'
    and r.title = 'AI 데이터센터·AI 인프라 경쟁 심화와 LG U+ B2B 시사점'
),
ins as (
  insert into public.ai_reports (user_id, type, status, title, prompt, body_md)
  select u.id, '시장동향'::ai_report_type, 'completed'::ai_report_status,
    'AI 데이터센터·AI 인프라 경쟁 심화와 LG U+ B2B 시사점',
    '2026-06-12~18 수집 콘텐츠 기반 시장동향 전략보고서 (샘플)',
    $md$# AI 데이터센터·AI 인프라 경쟁 심화와 LG U+ B2B 시사점

**유형:** 시장동향 · **기간:** 2026-06-12 ~ 06-18

## 1. Executive Summary
- 최근 한 주 B2B 텔레콤·엔터프라이즈 시장은 **AI 데이터센터(AIDC) 구축 경쟁**과 **통신사의 'AI 인프라 사업자' 전환**에 압도적으로 쏠렸다.
- 정부는 **AIDC 특별법 하위법령·지방 분산·인허가 완화**로 정책 드라이브를 걸었고, 경쟁의 승부처는 칩이 아니라 **전력·냉각·입지·운영권**으로 이동했다.
- 경쟁사 **SKT(엔비디아 AI 팩토리, AWS 울산 7조)**·**KT(부울경 현장형 AX 거점)**가 빠르게 포지셔닝 중이며, **LG U+**도 AI 인프라를 전방위 확대 중이나 **차별화 서사·B2B 패키지 메시지**가 상대적으로 약하다.
- 동시에 **앤트로픽 수출통제발 'AI 주권' 리스크**가 인프라·모델 의존도와 맞물려 부상했다.

## 2. 주요 동향 (이번 주)
- **구축 경쟁 가속:** 효성(서울 도심 AI DC)·STT GDC(STT Seoul 1)·통신3사·전력/건설사까지 진입. "AI 심장"을 둘러싼 대기업 출사표가 이어졌다.
- **정부 정책:** 과기정통부가 AI 데이터센터 특별법 하위법령에 착수, **지방 분산·비수도권 특구·인허가 일괄처리** 추진. 국가AI컴퓨팅센터 출범(초대 대표 삼성SDS 안정태), GPU 클라우드 공급 경쟁 시작.
- **전력·냉각이 핵심:** KAIST 냉각 전력 1/10 기술 등 효율 경쟁. 한국 데이터센터의 **침수·전력 리스크**가 지적되며 SMR 등 에너지 해법 논의.
- **통신사 AI 인프라화:** SKT–엔비디아 5GW 'AI 팩토리', SKT–AWS 울산 7조 투자로 통신을 넘어선 인프라 전환 가시화. "AI 3강 도약에 통신 인프라 투자 필수" 정책 메시지 반복.

## 3. 과거 흐름 (맥락)
일반적으로 2024~2025년이 클라우드·생성형 AI '확산'기였다면, 2026년은 **인프라(전력·냉각·입지) 병목**이 경쟁의 중심으로 이동한 국면이다. "칩 다음은 전력·운영권".

## 4. 경쟁사 움직임
- **SKT** — 엔비디아 AI 팩토리·AWS 울산 데이터센터(7조)로 **최대 AI 인프라 사업자** 지향. 'AX 혁신 2.0'(AI에 사번)으로 일하는 방식 재설계.
- **KT** — 부산 클라우드 데이를 거점으로 **부울경을 제조·물류 현장형 AX 거점**으로 공략, 버티컬 AI 에이전트 사업 본격화.
- **삼성SDS** — 국가AI컴퓨팅센터 초대 대표로 **공공 AI 인프라** 입지 확보.

## 5. 사업적 시사점 (LG U+ 관점)
- LG U+는 AI 인프라를 전방위 확대 중이며(그룹 AI 전략 핵심축) STT Seoul 1 협력 등 자산 보유. 그러나 SKT·KT 대비 **차별화 서사·B2B 패키지**가 약하다.
- 현장 신호: 엔터프라이즈·공공 고객은 "AI를 도입해야 하는데 방법을 모른다" 상태 → **현장형 AX 길잡이 + 보안형 패키지** 수요를 경쟁사가 선점 중.

## 6. 기회 / 리스크
**기회**
- 전력·냉각 효율·파트너십을 B2B 차별화로 전환
- 지방 AIDC 특구·인허가 완화로 입지 선점
- 금융·공공 AX 규율 대응 패키지, 보안형 AI 에이전트 수요

**리스크**
- 전력·침수 등 데이터센터 인프라 리스크
- **앤트로픽 수출통제발 AI 주권/공급 리스크**(단일 모델·해외 의존)
- SKT·KT의 거점·인프라 선점

## 7. 대응 방향 (제언)
1. 전력·냉각·입지 확보를 **B2B 메시지·패키지로 전환**.
2. 경쟁사 "현장형 AX 거점"에 대응하는 **산업별 AX 패키지**(고객망·보안 결합).
3. AI 주권 리스크 대비 **멀티-모델·소버린 옵션** 검토.

## 8. 후속 모니터링
- AIDC 특별법 하위법령 확정·지방 특구 선정
- SKT 엔비디아 AI 팩토리·AWS 울산 진척
- 앤트로픽 수출통제 후속·한국 AI 주권 정책
- 전력·냉각 기술 상용화(KAIST 등)

---
> 근거: 2026-06-12~18 수집 콘텐츠 기반. 입력 밖 추론은 "일반적으로"로 구분 표기. 상세 근거는 하단 "근거 콘텐츠" 참고.
$md$
  from public.users u
  where u.email = 'yjhead@gmail.com'
    and not exists (select 1 from existing)
  returning id
)
insert into public.ai_report_sources (ai_report_id, content_id)
select ins.id, v.cid
from ins
cross join (values
  ('1082af41-2470-4144-957a-632cd29cb282'::uuid),
  ('c4371b55-e9a3-4551-a6ec-931ce15dd1f5'::uuid),
  ('e7e91d8f-cc8a-42a0-ae07-147eb2264dbc'::uuid),
  ('dc720fd7-5a6e-43c0-9d04-0995dad24d74'::uuid),
  ('8e3670e9-5850-49d0-bc47-f32a32ae481f'::uuid),
  ('43d8cd73-0406-4c45-9974-58c81bec5817'::uuid),
  ('0279fd47-9dc2-48df-bc84-4f18502363fb'::uuid),
  ('a1a1d02c-1e85-430a-ad8a-c90131da884a'::uuid)
) as v(cid)
where exists (select 1 from public.contents c where c.id = v.cid)
on conflict do nothing;

-- 검증
-- select title, status, length(body_md) from public.ai_reports where title like 'AI 데이터센터%';
