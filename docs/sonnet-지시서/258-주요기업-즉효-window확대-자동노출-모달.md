# 지시서 258 — 주요 기업 즉효 (생성 window 확대 + 자동 노출 + 설정 모달)

목표: 주요 기업 탭이 비어 있는 문제를 즉시 해소한다. 진단: (1) 생성 window 7일이 좁아 **1개사(SK하이닉스)만 생성**, (2) 그 카드도 **draft라 published-only 뷰에서 안 보임**, (3) 설정 모달이 옛 검색만 노출(curated 체크 UI 미표시). build 단계이므로 window 확대 + 회사 카드 자동 노출 + 모달 수정.

범위: `lib/insight/generate.ts`(window) + `lib/insight/auto-publish.ts`(회사 카드 완화) + WatchlistManager(curated 체크 UI). SQL 없음. (코퍼스 확충=259 별도.)

---

## 1. 현행 진단 (검증된 코드 사실)
- `generateCompanyInsightCards`: `days` 기본 **7**, `minArticles=2`. 회사명+aliases ilike로 최근 7일 기사 매칭 → 2건 미만 스킵. 대부분 회사가 7일 내 기사 부족 → 스킵(1개만 생성).
- 카드 status = `insightAutoPublish(validCitations, sourceCount)` = **인용≥2 && 출처≥3**이면 published, 아니면 **draft**.
- `getMajorCompaniesData`(255): `insight_cards` **status='published'·scope='company'**만 조회 → draft 카드는 안 보임 → 그룹 0 → "주요 기업 동향이 아직 없습니다".
- 설정 모달(WatchlistManager): 스크린샷에 검색창만 — curated 그룹 체크 UI 미노출(로딩 실패/조건부/크롭 확인).

## 2. 구현

### 2-1. 생성 window 확대 (build 단계)
- 회사 생성 `days` 기본값 **7 → 90**(build용 코퍼스 활용). 상수/`process.env.COMPANY_INSIGHT_WINDOW_DAYS` 로 조정 가능하게.
  - 근거: KT178·SKT113·AWS58 등 기사는 있으나 7일 내엔 적음 → 90일이면 다수 회사 확보. (코퍼스 풍부해지면 추후 축소.)
- `articlesPerCompany` 상향(예: 8→12)로 근거 다양성 확보(인용/출처 수↑ → 아래 자동노출 유리).
- minArticles 유지(2) 또는 **1로 완화**(1건이라도 있으면 카드) — build 단계 노출 우선. 권장: **1**.

### 2-2. 회사 카드 자동 노출 (auto-publish 완화)
- 회사(scope='company') 카드는 **완화된 기준**으로 published:
  - `auto-publish.ts`에 회사용 임계 추가: 예 `company: { minCitations: 1, minSources: 1 }`. `insightCompanyAutoPublish(validCitations, sourceCount)` = 인용≥1 && 출처≥1.
  - `generateCompanyInsightCards`에서 산업용 `insightAutoPublish` 대신 **회사용** 함수 사용.
  - 근거 0(환각 인용만)인 카드만 draft로 남김(최소 품질 가드).
- 효과: 생성된 회사 카드가 대부분 즉시 published → 주요 기업 뷰에 노출.
- (대안: 주요 기업 뷰가 draft도 "AI 초안" 배지로 노출 — 채택 시 published-only 필터 완화. 이번은 auto-publish 완화 방식.)

### 2-3. 설정 모달 curated 체크 UI 수정
- "주요 기업 설정" 모달에 **curated_companies 그룹별 회사 체크 목록**이 실제 렌더되는지 확인·수정:
  - `curated_companies`(+curated_groups kind='watchlist') 로드 → 그룹별 회사 체크박스. 체크 = user_watchlist upsert(curated name·entity_id).
  - 42P01 graceful(253 전엔 검색만). 253 적용됐으니 체크 UI가 떠야 함 — 미표시면 로드/조건 분기 수정.
  - 기존 검색/수동추가 유지(공존).

## 3. 회귀 가드
- 산업(industry) 카드 auto-publish·생성 **불변**(회사 scope만 완화). issue 등 무관.
- window 확대는 생성 대상만 넓힘(데이터 결과 동일, 후보만 증가). deadline 분할로 시간 관리.
- 253/254 미적용 graceful 유지.
- 자동 노출된 회사 카드는 어드민에서 unpublish 가능(품질 관리 여지).

## 4. 검증 (Sonnet)
- `npx tsc --noEmit` 0, `npx eslint` 0, `npm run build`.
- 회사 생성 1회전(어드민): **다수 회사 카드 생성·published**(SK하이닉스 외 KT·삼성전자·AWS 등), implication 한국어.
- 주요 기업 탭: 그룹 섹션에 카드 노출(빈 상태 해소).
- 설정 모달: curated 그룹 체크 UI 노출·선택 반영.

## 5. 라이브 체크리스트
- [ ] 생성 후 주요 기업 탭에 회사 카드 다수 노출(그룹별).
- [ ] 카드 한국어·해시태그·시사점3·근거3.
- [ ] 설정 모달 curated 체크 선택 동작.
- [ ] 니치 회사(뉴스 없는)는 여전히 빈 그룹 — 259(타깃 수집)로 후속.

## 6. 후속
- **259**: 회사별 타깃 뉴스 수집(니치 회사 코퍼스 확충).
- 코퍼스 풍부해지면 window 90→축소, minArticles·auto-publish 재조정.

SQL 없음. 이 지시서는 생성 window·auto-publish·설정 모달.
