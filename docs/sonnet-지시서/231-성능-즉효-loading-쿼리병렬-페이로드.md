# 지시서 231 — 성능 즉효(로딩 스켈레톤 + 쿼리 병렬화 + 목록 페이로드 축소)

목표: 페이지 전환/로딩 체감 속도를 크게 개선한다. **안전·저위험** 3종만: ① 주요 섹션에 `loading.tsx`(즉시 스켈레톤) ② 순차 Supabase 쿼리 병렬화(Promise.all) ③ 콘텐츠 목록 쿼리에서 대용량 `body_original` 제거. 캐싱·SSR화·미들웨어 최적화 같은 큰 변경은 **232로 분리**(리스크 검토 필요).

범위: 동작·데이터 결과 불변, 속도만. SQL 없음.

---

## 1. 현행 진단 (검증된 코드 사실 — 성능 진단 결과)
- **loading.tsx 부재**: `/dashboard/issues`만 `loading.tsx` 있음. 홈·기업동향·콘텐츠·전략보고서는 **없음 → 전환 시 빈 화면(멈춘 느낌).**
- **순차 쿼리 워터폴**: `entities/page.tsx`는 초기 `Promise.all` 이후 insight_cards→contents→entities→contents→entity_signal_summary→entities로 **6+개 직렬 await**(≈600–700ms). `entities/[id]/page.tsx`도 4+ 직렬.
- **대용량 페이로드**: `contents/page.tsx` 목록 쿼리가 `body_original`(HTML 본문, 항목당 수십KB)를 select. 발췌(`toExcerpt`)에 쓰이지만 목록 20개면 수백KB~1MB.
- (참고: 콘텐츠 페이지는 클라이언트 컴포넌트라 초기 fetch가 브라우저에서 일어남 → loading.tsx가 그 사이 스켈레톤 제공.)

## 2. 구현

### 2-1. loading.tsx 추가 (즉시 스켈레톤) — 4곳
기존 `src/app/dashboard/issues/loading.tsx` 패턴 미러(PageContainer + `animate-pulse` 스켈레톤). 각 섹션 레이아웃에 맞춰:
- `src/app/dashboard/loading.tsx`(홈): 섹션 스택 스켈레톤.
- `src/app/dashboard/entities/loading.tsx`: 탭 + 카드 그리드 스켈레톤.
- `src/app/dashboard/contents/loading.tsx`: 탭 + 카드 그리드(2~3열) 스켈레톤.
- `src/app/dashboard/reports/loading.tsx`: 헤더 + 카드 그리드 스켈레톤.
> 폭은 226 `PageContainer` 그대로. 톤은 refined(회색 pulse, 마젠타 없음).

### 2-2. 순차 쿼리 병렬화 (Promise.all)
- `entities/page.tsx`: **서로 의존 없는** 쿼리들을 그룹지어 `Promise.all`로 묶기.
  - 의존 관계 판별: A의 결과(id 목록)를 B의 `.in(...)`에 쓰면 A→B는 순차 유지. 그 외 독립 쿼리(경쟁사 목록·시그널 요약 등)는 초기 배치에 합류.
  - 예: `insight_cards`(companyCards 기반)와 `entities(is_competitor)`·`entity_signal_summary`는 서로 독립 → 한 `Promise.all`. 그 뒤 결과 id로 하는 `contents`·`entities.in(eids)`만 2차 배치.
  - 목표: 6직렬 → 2~3배치.
- `entities/[id]/page.tsx`: 동일 원칙으로 독립 쿼리 병렬화(초기 `Promise.all`에 profile·aliases 합류 등).
- **결과·정렬·필터 로직은 불변** — 호출 순서만 병렬로.

### 2-3. 콘텐츠 목록 페이로드 축소 (body_original 제거)
- `contents/page.tsx` 목록 select에서 **`body_original` 제거**.
- 발췌(`toExcerpt`) 안전 폴백: `summary_ko`만 사용. `summary_ko`가 없으면 발췌 생략(제목·메타만) 또는 빈 문자열 — **본문 원문을 목록에서 끌어오지 않음**.
- 상세 페이지(`contents/[id]`)는 기존대로 본문 로드(무변경).
- (선택·232 후보: 짧은 발췌 컬럼을 DB에 두면 폴백 품질↑ — 지금은 스코프 밖.)

## 3. 회귀 가드
- 각 페이지 **데이터 결과 동일**(쿼리 순서만 병렬화, select에서 body_original만 제외).
- loading.tsx는 전환 중에만 표시 → 최종 렌더 불변.
- 콘텐츠 발췌: summary_ko 있는 항목은 종전과 동일, 없는 항목만 발췌 축약(제목·메타는 그대로).
- 병렬화 시 **의존 쿼리(id→in) 순서 보존**(잘못 묶으면 빈 결과) — 의존 관계 재확인.
- 라이트/다크 스켈레톤 정상.

## 4. 검증
- `npx tsc --noEmit` 0, `npx eslint`(수정/신규) 0, `npm run build`.
- 각 섹션 전환 시 즉시 스켈레톤 → 콘텐츠, 데이터 정확.

## 5. 라이브 체크리스트
- [ ] 홈·기업동향·콘텐츠·전략보고서 전환 시 **즉시 스켈레톤**(빈 화면 없음).
- [ ] 기업동향·엔티티 상세 로딩이 눈에 띄게 빨라짐.
- [ ] 콘텐츠 목록 초기 로드 페이로드↓(네트워크 탭 확인), 발췌 정상.
- [ ] 모든 목록/상세 데이터 결과 동일(회귀 없음).

SQL 없음. 큰 개선(콘텐츠 SSR화·미들웨어·캐싱)은 232로.
