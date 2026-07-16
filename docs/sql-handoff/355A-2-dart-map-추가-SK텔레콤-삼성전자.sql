-- 355-A-2 — entity_dart_map 추가: SK텔레콤·삼성전자
-- 수희 실행: Supabase SQL Editor 1회. 멱등(on conflict).
-- 배경: 355-A 시드는 entities.canonical_name 정확일치 조인이라 SK텔레콤·삼성전자가
--   이름 표기 차이로 매핑에서 빠졌다(드롭다운에 LG유플러스·KT만 노출).
--   여기선 curated_companies(253에서 name/alias로 entity_id를 이미 해석)를 경유해
--   더 견고하게 매핑한다. corp_code는 DART 공식값(검증됨).

insert into public.entity_dart_map (entity_id, corp_code, corp_name)
select cc.entity_id, v.corp_code, v.corp_name
from (values
  ('SK텔레콤', '00159023', 'SK텔레콤'),
  ('삼성전자', '00126380', '삼성전자')
) as v(name, corp_code, corp_name)
join public.curated_companies cc on cc.name = v.name
where cc.entity_id is not null
on conflict (corp_code) do update
  set entity_id = excluded.entity_id,
      corp_name = excluded.corp_name;

-- 확인: 매핑된 회사 목록
-- select m.corp_code, m.corp_name, e.canonical_name
-- from public.entity_dart_map m
-- left join public.entities e on e.id = m.entity_id
-- order by m.corp_name;

-- ⚠️ SK텔레콤/삼성전자가 여기서도 안 잡히면(curated_companies.entity_id IS NULL),
--    해당 엔티티가 entities에 없거나 253 링크가 안 된 것 — 그 경우 entities 등록/링크 선행 필요.
