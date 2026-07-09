# 지시서 254 — 주요 기업 생성 백엔드 (curated 소스 + 한글 프롬프트 DB)

목표: 회사별 AI 동향 카드 생성을 **큐레이션 회사(`curated_companies`) 기반**으로 바꾸고, 프롬프트를 **`llm_prompts`(DB, 어드민 편집)에서 로드**하며 **반드시 한국어로** 생성한다. 일 1회 배치(deadline 분할). 이게 주요 기업/경쟁사 동향 두 탭의 공통 데이터원(카드).

배경(진단): 현재 `generateCompanyInsightCards`는 (1) **user_watchlist** 소스라 큐레이션과 무관·즉시성 없음, (2) 프롬프트가 **코드 상수 + 한국어 미강제**라 sambanova/mistral이 **영어로 출력**(스크린샷 이슈), (3) 이름 ilike 단일 매칭이라 표기 차이 누락.

David 결정: (a)안 — 주요 기업=일반 동향 카드(고객 포함). 큐레이션 41개사, 일 1회.

범위: `lib/insight/generate.ts`(회사 생성부) + `llm_prompts`·`curated_companies` 조회. 전제: **253 SQL** 적용. SQL 없음(253 재사용).

---

## 1. 현행 진단 (검증된 코드 사실)
- `generateCompanyInsightCards`: `user_watchlist` dedup 인기순 top15 → 회사명 `or(title.ilike, summary_ko.ilike)` 기사 → **`llmComplete('report', COMPANY_SYSTEM_PROMPT, ...)`** → `insight_cards`(scope='company', topic=회사) upsert(period,scope,topic). minArticles=2.
- `COMPANY_SYSTEM_PROMPT`(코드 상수): 한국어로 쓰였으나 **"반드시 한국어 출력" 미명시.** 'report' 라우팅=cerebras(GLM)→gemini→mistral → 한국어 약한 provider가 영어 생성 가능.
- cron `ai-refresh`에서 호출.

## 2. 구현

### 2-1. 소스 = curated_companies (user_watchlist 아님)
- 대상: `curated_companies`(`is_active`). 전체 41개(또는 `groups` 중 watchlist kind 포함분 — 사실상 전체). 
- **기사 매칭 = name + aliases**: 각 회사의 `name`·`aliases[]` 각각으로 `contents`(published·최근 days) `title/summary_ko ilike` OR → 합집합 dedup. (기존 단일 ilike → name+aliases 다중.)
- 인기순 대신 **curated sort_order**(또는 이슈 중요도) 순. **maxCompanies 캡 상향/제거**(41개 다 대상, deadline 분할로 시간 관리).
- minArticles 게이트 유지(기사 부족 회사는 이번 회차 스킵, 다음날 재시도).

### 2-2. 프롬프트 = llm_prompts DB 로드 (한글 강제)
- 생성 직전 `llm_prompts` 에서 `key='company_insight'` prompt_text 로드 → 시스템 프롬프트로 사용.
  - **미존재/42P01 graceful**: 코드 기본 상수(한글 강제판)로 폴백. 코드 상수도 **"반드시 한국어로만 작성. 영어 문장·단어 나열 금지(고유명사 제외)"** 문구 추가(253 시드와 동일).
- 한글 강제로 provider 무관하게 한국어 출력 유도.

### 2-3. 한국어 provider 우선 (영어 방지 보강)
- 회사 인사이트 생성 태스크를 **`'summarize'`**(라우팅 gemini→sambanova→cerebras→mistral, gemini 1순위=한국어 우수)로 변경 검토 — 현재 `'report'`(cerebras GLM 1순위). 또는 `'report'` 유지하되 프롬프트 한글강제로 대응.
  - 권장: **`'summarize'` 사용**(gemini 우선 → 한국어 품질↑). report 태스크는 문서용.
- (선택) 파싱 후 결과가 한글 비중 현저히 낮으면(영어 감지) 1회 재생성 or 다음 provider — 과설계 지양, 우선 프롬프트+태스크로.

### 2-4. 카드 기간·주기
- 기간=롤링 days(기본 7일). 일 1회 cron → 같은 (period,scope,topic) upsert로 매일 갱신(최신 동향).
- **deadline 분할**: `ai-refresh`의 기존 deadline 패턴으로 41개 순차 중 시간 초과 시 중단, 다음 실행 이어감. (또는 전용 cron 분리 — 선택.)

## 3. 회귀 가드
- insight_cards 스키마·upsert·citation 검증 **불변**(소스·프롬프트·태스크만 변경).
- 253 미적용(curated_companies 없음, 42P01) 시: graceful — user_watchlist 폴백 or 0 반환(크래시 금지). (권장: 253 적용 전엔 기존 user_watchlist 경로 유지하는 분기, 또는 빈 반환+로그.)
- llm_prompts 미적용 시 코드 기본 프롬프트 폴백.
- 산업(industry) 카드 생성 등 다른 경로 불변.
- 영어 출력: 한글 강제 프롬프트 + gemini 우선으로 해소(실측 확인).

## 4. 검증 (Sonnet)
- `npx tsc --noEmit` 0, `npx eslint` 0, `npm run build`.
- 253 적용 후 생성 1회전(수동 트리거 or cron): curated 41개사 대상, **카드 implication이 한국어**인지, citations 3건 내외인지.
- llm_prompts 편집 반영(프롬프트 바꾸면 다음 생성부터 적용).
- deadline 내 처리·이어받기.

## 5. 라이브 체크리스트 (253 SQL 후)
- [ ] 큐레이션 41개사에 회사 카드 생성(기사 충분한 곳).
- [ ] implication·headline **한국어**(영어 사라짐).
- [ ] 프롬프트 어드민 편집 시 반영.
- [ ] 일 1회 갱신, 시간 초과 시 다음 회차 이어감.

## 6. 후속
- 온디맨드(신규 큐레이션 추가 시 즉시 1건 생성) · 다중 전개 요약 · 전용 cron 분리.
- UI(계층 그룹카드·골드 테두리·사용자 선택)는 **255**.

SQL 없음(253). 이 지시서는 생성 백엔드(소스·프롬프트·태스크·주기).
