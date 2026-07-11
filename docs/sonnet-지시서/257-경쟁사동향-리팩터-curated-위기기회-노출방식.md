# 지시서 257 — 경쟁사 동향 리팩터 (curated + 위기/기회 오버레이 + 노출방식)

목표: 경쟁사 동향 탭을 **curated 5그룹 기반**으로 바꾸고, **경쟁 관점 오버레이(위기/기회, 241 lgu_impact)**를 얹으며, 그룹별 **노출 방식(always / on_issue)**을 적용한다. 주요 기업과 같은 회사 카드를 쓰되 **경쟁 렌즈**로 차별화((a)안).

David 확정 (a)안: 주요 기업=일반 동향, 경쟁사 동향=경쟁 관점(위기/기회·수주/제휴, always/on_issue). 회사는 겹쳐도 관점이 달라 상호보완.

범위: `entities/page.tsx`(경쟁사 동향 뷰) 리팩터 + 그룹박스 + 위기/기회 오버레이. 전제: **253 SQL**(curated)·**254 생성**·**241 lgu_impact**·**255 회사 카드 컴포넌트**. SQL 없음.

---

## 1. 현행 진단 (검증된 코드 사실)
- 경쟁사 동향(구 224/243 trend 뷰): `insight_cards`(scope company/industry)를 **`entities.competitor_group`(3그룹)** 로 매칭·그룹핑 → `InsightCardsSectionClient`(boxed).
- 246으로 entities.competitor_group 태깅했으나 **253으로 curated_companies(다중 그룹·별칭)로 이전** → entities 태깅 대체.
- 241 `contents.lgu_impact`(위기/기회/관망) 존재(경쟁사 기사 대상). 242/245(경쟁사 최근뉴스)는 폐지됐고 lgu_impact는 여기서 재활용.

## 2. 구현

### 2-1. 데이터 = curated (5 경쟁사 그룹)
- `curated_groups`(kind='competitor', sort_order, display_mode) 5개 로드: cp_telecom·cp_aidc(always) / cp_cloud·cp_sidx·cp_security(on_issue).
- `curated_companies`(is_competitor) — 각 회사 name·aliases·groups(cp_* 포함분).
- 회사별 최신 company `insight_card`(254 생성, topic=회사) 조인. **카드↔회사 매칭 = name+aliases**.
- 그룹 소속 = curated_companies.groups 배열에 그 cp_* key 포함(다중 소속 자연 처리: 네이버클라우드 cp_aidc·cp_cloud 양쪽).

### 2-2. 위기/기회 오버레이 (241 재활용)
- 각 회사 카드에 **위기/기회/관망 칩** 추가: 그 카드의 `source_content_ids`(+citations) 콘텐츠들의 **`lgu_impact` 집계**(예: 위기 N·기회 M·관망 K). `contents.lgu_impact` 배치 조회.
  - 칩 색: 위기 `bg-negative-soft text-negative`, 기회 `bg-blue-50 text-blue-700`, 관망 `bg-muted`.
  - 위기/기회가 뚜렷한 회사는 상단 정렬 가중(경쟁 위협·기회 우선 노출).
- 42703(lgu_impact 미적용) graceful — 칩 생략.

### 2-3. 노출 방식 (always / on_issue)
- 그룹별 `display_mode`:
  - **always**(cp_telecom·cp_aidc): 그룹박스 **항상 노출**(카드 적어도 노출, 빈 상태 안내).
  - **on_issue**(cp_cloud·cp_sidx·cp_security): 최근 관련성 **임계치 이상일 때만** 그룹 노출. 임계치 = 최근 14일 그룹 내 회사 관련 기사 **2건 이상**(또는 카드 존재). 미달 시 그룹 숨김.
    - cp_sidx·cp_security는 이슈 성격(수주/제휴, 보안)이라, v1은 단순 건수. 유형 가중(수주/제휴·보안 키워드)은 후속.

### 2-4. 렌더 (그룹박스, 255 카드 재사용)
- 5 경쟁사 그룹 순서대로 **그룹박스**(245/255 톤): 헤더(그룹 label + 회사 수) + 회사 카드 그리드.
- 회사 카드 = **255의 회사 카드 컴포넌트 재사용**(제목·시사점·근거·해시태그) + **위기/기회 칩 추가**. 클릭 → 249 상세.
- 골드 테두리(255 이슈중요도)도 동일 적용 가능(경쟁 위협 급상승 강조).

## 3. 회귀 가드
- 주요 기업(255)·AI인사이트 등 다른 뷰 불변(경쟁사 동향 뷰만 리팩터).
- 253/254/241 미적용 각각 graceful(빈 그룹/칩 생략, 크래시 금지).
- curated 다중 그룹으로 한 회사가 여러 그룹에 노출될 수 있음(의도 — 네이버클라우드 등). 중복 카드는 그룹별 맥락이라 허용.
- getCardDetailHref(249) 그대로.

## 4. 검증 (Sonnet)
- `npx tsc --noEmit` 0, `npx eslint` 0, `npm run build`.
- 경쟁사 동향 = 5그룹, always 2그룹 항상 노출·on_issue 3그룹 이슈 있을 때.
- 회사 카드에 위기/기회 칩(lgu_impact 집계), 경쟁 위협 회사 상단·골드.
- 카드 → 249 상세.

## 5. 라이브 체크리스트 (253·254·241백필 후)
- [ ] 경쟁사 동향 = 통신B2B·AIDC/IDC(항상) + 클라우드AI·SI/DX·보안(이슈 있을 때).
- [ ] 회사 카드 위기/기회 칩, 위협/기회 회사 강조.
- [ ] 다중 그룹 회사(네이버클라우드 등) 해당 그룹들에 노출.
- [ ] 카드 → 상세, 한국어.

## 6. 후속
- on_issue 유형 가중(수주/제휴·보안 키워드) · 경쟁 관점 전용 프롬프트(위기/기회 강화)로 카드 차별화 심화.

SQL 없음(253·241 재사용). 이 지시서는 경쟁사 동향 프론트(curated·위기기회·노출방식).
