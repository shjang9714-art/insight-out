# 지시서 259 — 회사별 타깃 뉴스 수집 (curated seeds)

목표: curated 회사(특히 뉴스가 드문 니치 회사: 지니언스·메가존클라우드·시큐아이·현대오토에버 등)의 **코퍼스를 채운다**. `curated_companies`의 **name + aliases를 Google News RSS 검색 seed**로 넣어, 기존 키워드 검색 수집 파이프라인을 그대로 재사용해 기사를 수집한다. → 그러면 254/258의 회사 인사이트 생성이 각 회사 기사를 확보한다.

배경: build 단계. window 확대(258)로 major 회사는 채워지나, entities 언급 0인 니치 회사는 기사 자체가 없음 → 타깃 수집 필요. David: "회사 기사 모아오기".

범위: `lib/crawler/orchestrator.ts`(회사 seed 수집 스텝 추가) + 크롤 cron 연결. SQL 없음(253 재사용).

---

## 1. 현행 진단 (검증된 코드 사실)
- 크롤러에 **키워드 기반 Google News RSS 수집 존재**: `crawlKeywordSearch(admin, seeds, keywords, groups, …)`(orchestrator.ts) — seed별 `googleNewsRss(seed)` fetch → `processCrawlItem`(**dedup·게이트·분류(matched_groups/keywords)·엔티티 링킹·번역·요약** 전 파이프라인) 자동.
- 즉 **seed 목록만 회사명으로 바꾸면** 회사 기사가 동일 품질로 수집·태깅됨.
- `keyword_groups.search_seeds`가 현재 seed 소스.

## 2. 구현

### 2-1. 회사 seed 수집 스텝 (`crawlCompanySearch`)
- `curated_companies`(`is_active`) 조회 → **seed = name + aliases 합집합**(dedup, 상한 예: 120개).
  - 너무 일반적/짧은 별칭(오탐 유발) 제외 옵션(예: 2자 이하 영문 약어는 name과 함께만). 기본은 name + 한글/영문 별칭.
- **기존 `crawlKeywordSearch`를 그대로 호출**(seeds=회사 seeds). 나머지 인자(keywords·groups·budgets·aliasMap·issueList·exclusion·minBodyLength)는 메인 크롤과 동일하게 전달.
  - 재사용 이유: dedup·게이트·분류·엔티티·번역·요약이 전부 그 안에 있음 → 회사 기사도 뉴스와 동일 취급.
- 반환 counts 합산·로깅(회사 수집분 가시화).

### 2-2. 크롤 cron 연결 + 캐던스
- 메인 크롤 오케스트레이션(크론)에 `crawlCompanySearch` 스텝 추가.
- **캐던스**: build 단계엔 매 크롤(또는 일 1회). seed 120개 × RSS fetch라 부하 있음 → **deadline 인지**(기존 크롤 deadline 패턴)로 시간 초과 시 중단·다음 회차 이어감. 또는 회차당 seed 라운드로빈(하루 N개씩).
- 코퍼스 채워지면 캐던스 완화(주 1~2회).

### 2-3. 노이즈 가드
- 동명이의·일반어 오탐은 기존 **게이트·exclusion·분류**가 대부분 걸러냄(뉴스 파이프라인과 동일).
- 회사명이 매우 일반적이면(예: '카카오'·'네이버') 이미 뉴스 수집에 잡히므로 중복 seed 이득 적음 — 니치 회사 위주 효과. (전체 넣어도 dedup으로 무해.)

## 3. 회귀 가드
- **기존 크롤·키워드 수집 불변** — 회사 seed 스텝만 추가.
- `processCrawlItem` 재사용이라 dedup(중복 기사 재삽입 안 함)·게이트·태깅 자동 → 데이터 오염 없음.
- 253(curated_companies) 미적용 시 seed 0 → 스텝 skip(graceful).
- 번역/요약/분류 budget 공유 — 초과 시 기존 로직대로 스킵(크래시 없음).
- deadline로 크롤 전체 시간 관리(회사 수집이 다른 수집 굶기지 않게 순서·budget 배분).

## 4. 검증 (Sonnet)
- `npx tsc --noEmit` 0, `npx eslint` 0, `npm run build`.
- 크롤 1회전(수동/크론): 회사 seed로 니치 회사(지니언스·메가존 등) 기사 신규 수집(inserted>0), matched_groups·엔티티 태깅됨.
- 이후 회사 인사이트 생성(258 window)에서 해당 회사 카드 생성되는지.
- dedup: 재실행 시 중복 삽입 없음.

## 5. 라이브 체크리스트 (배포 후)
- [ ] 크롤에 회사 seed 수집 스텝 동작, 니치 회사 기사 유입.
- [ ] 수집 기사 분류·엔티티 태깅 정상.
- [ ] 주요 기업 탭에 니치 회사 카드도 등장(258 생성 후).
- [ ] deadline 내 처리·이어받기, 기존 수집 무영향.

## 6. 후속
- 코퍼스 충분해지면 캐던스·window 축소.
- 회사별 수집량 대시보드(어드민)로 커버리지 모니터링(선택).

SQL 없음(253 재사용). 이 지시서는 크롤러에 회사 seed 수집 스텝 추가.
