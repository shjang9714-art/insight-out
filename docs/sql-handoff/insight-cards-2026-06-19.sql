-- ============================================================
-- AI 인사이트 카드 시드 (Opus/Claude 작성 — LLM 토큰 부족 대체)
-- 수희 실행: Supabase SQL Editor. insight_cards 기존 스키마.
-- scope='industry', status='published' → AI 분석 인사이트 섹션에 즉시 노출.
-- 기간: 2026-06-13 ~ 06-19(이번 주). 멱등: (period_start,scope,topic) unique.
-- citations content_id 는 코퍼스 실제 기사 — 검증되면 출처 링크로 표시.
-- ============================================================

insert into public.insight_cards
  (period_start, period_end, scope, topic, headline, implication, source_content_ids, citations, status, generated_at)
values
(
  '2026-06-13', '2026-06-19', 'industry', 'AI 데이터센터',
  'AI 데이터센터 구축 경쟁이 ''전력·냉각·입지'' 승부처로 옮겨갔다',
  '칩보다 전력·냉각·입지 확보가 차별화 포인트. LG U+는 전력 패키지·STT 협력·지방 특구를 B2B 영업 언어로 전환해 포지셔닝할 필요.',
  array['1082af41-2470-4144-957a-632cd29cb282','c4371b55-e9a3-4551-a6ec-931ce15dd1f5','e7e91d8f-cc8a-42a0-ae07-147eb2264dbc']::uuid[],
  '[
    {"content_id":"c4371b55-e9a3-4551-a6ec-931ce15dd1f5","quote":"AIDC 특별법 시행령 마련 착수…지방 분산·인허가"},
    {"content_id":"1082af41-2470-4144-957a-632cd29cb282","quote":"전력기기 성공신화, AI 데이터센터로 잇는다"}
  ]'::jsonb,
  'published', now()
),
(
  '2026-06-13', '2026-06-19', 'industry', '통신사 AI 인프라',
  '통신사가 ''AI 인프라 사업자''로 전환 — SKT 엔비디아 AI 팩토리·AWS 울산 7조',
  '경쟁사가 인프라 사업자로 빠르게 이동 중. LG U+는 AI 인프라 자산을 명확한 차별화 서사·산업별 B2B 패키지로 묶어 대응해야.',
  array['dc720fd7-5a6e-43c0-9d04-0995dad24d74','8e3670e9-5850-49d0-bc47-f32a32ae481f','2c0a8426-4b06-4515-8140-a90e0cacf73f']::uuid[],
  '[
    {"content_id":"dc720fd7-5a6e-43c0-9d04-0995dad24d74","quote":"엔비디아 손잡은 SKT, AI 데이터센터 운영 두뇌 만든다"},
    {"content_id":"8e3670e9-5850-49d0-bc47-f32a32ae481f","quote":"SKT-AWS, 울산데이터센터에 7조 투자"}
  ]'::jsonb,
  'published', now()
),
(
  '2026-06-13', '2026-06-19', 'industry', 'AI 에이전트',
  'AI 에이전트가 도구→동료로, 도입 기준이 ''보안·권한''으로 이동',
  'B2B SaaS·업무자동화에서 보안형 에이전트 수요 증가. 경쟁사(KT 버티컬·SKT AX) 선점에 대응한 보안·권한 중심 패키지가 차별화 기회.',
  array['01657ad4-612f-4286-a48c-867d761fe6f9','e53d6a4c-47ff-4f56-839b-2a6fd02699d3','13637f18-7959-4b08-8852-853e1ca97894']::uuid[],
  '[
    {"content_id":"01657ad4-612f-4286-a48c-867d761fe6f9","quote":"KT, 버티컬 AI 에이전트 사업 본격화"},
    {"content_id":"13637f18-7959-4b08-8852-853e1ca97894","quote":"AI 에이전트 기억장치도 해킹된다…원격 코드 실행"}
  ]'::jsonb,
  'published', now()
)
on conflict (period_start, scope, topic) do nothing;

-- 검증
-- select topic, headline, status from public.insight_cards where period_start='2026-06-13';
