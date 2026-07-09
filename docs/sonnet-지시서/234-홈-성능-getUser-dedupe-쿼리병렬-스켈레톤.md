# 지시서 234 — 홈 성능(getUser 중복 제거 + 섹션 쿼리 병렬화 + 폴백 스켈레톤)

목표: 홈(대시보드) 전환 시 **스켈레톤/로딩이 오래 뜨는 체감**을 없앤다. 원인은 스켈레톤이 아니라 **데이터가 느린 것** — ① 섹션마다 `getUser()` 중복(인증 왕복 5회) ② FeedSlot·섹션 내부 순차 쿼리 ③ "로딩 중..." 폴백. 셋 다 개선.

범위: 홈 서버 컴포넌트 최적화. 데이터 결과 불변, 지연만 단축. SQL 없음.

---

## 1. 현행 진단 (검증된 코드 사실)
- 홈 `src/app/dashboard/page.tsx`: 섹션 5종(`PersonalizationNudge`·`VisitDelta`·`IssueSignals`·`TodayBriefingHighlights`·`FeedSlot`)을 각 Suspense로 렌더. `feed_slot` 폴백이 **`<div>로딩 중...</div>`**(스켈레톤 아님).
- **`FeedSlot`**(`src/components/feed/FeedSlot.tsx`, async 서버): `supabase.auth.getUser()`(28) + services(31) + `getFeedOnboardingStatus`(37) + [keywordIds, primaryServiceId] 병렬(43) + keywordRows(50) + 폴백 콘텐츠(61). → **부분 순차.**
- **각 섹션도 자체 `getUser()` 호출**(IssueSignals·TodayBriefingHighlights·VisitDelta·PersonalizationNudge). → 홈 1회 렌더에 **`getUser()`(네트워크 검증) 5회 중복** + 각 섹션 내부 순차 쿼리(각 ~4~7 await).
- `getUser()`는 Supabase auth 서버 왕복이라 5회면 수백 ms 낭비.

## 2. 구현

### 2-1. getUser 중복 제거 (React cache)
- `src/lib/supabase/cached-user.ts`(신규): React `cache()`로 감싼 요청 단위 메모이즈.
  ```ts
  import { cache } from 'react'
  import { createClient } from '@/lib/supabase/server'
  export const getCachedUser = cache(async () => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
  })
  ```
- FeedSlot·4개 섹션이 `supabase.auth.getUser()` 대신 **`getCachedUser()`** 사용 → 한 요청 내 **1회로 dedupe**.
- (선택) 자주 쓰는 사용자 선호 조회(`getFeedOnboardingStatus`·`getUserPreferenceKeywordIds`·`getUserPrimaryServiceId`)도 `cache()`로 감싸 섹션 간 중복 제거 — userId 인자 기준 메모이즈.

### 2-2. FeedSlot 순차 쿼리 병렬화
- 1차 병렬: `Promise.all([services, getFeedOnboardingStatus])`. `status==='new'`면 조기 반환(services만 필요).
- 2차 병렬: `Promise.all([getUserPreferenceKeywordIds, getUserPrimaryServiceId, 폴백 콘텐츠 fetch])`(서로 독립).
- 3차: `keywordRows`(keywordIds 의존)만 순차.
- 결과·필터·dedup 로직 불변.

### 2-3. 각 섹션 내부 병렬화
- IssueSignals·TodayBriefingHighlights·VisitDelta·PersonalizationNudge: `getCachedUser()` 사용 + **서로 독립 쿼리는 `Promise.all`**(id→in 의존만 순서 유지). 각 섹션 결과 불변.

### 2-4. "로딩 중..." → 스켈레톤
- `page.tsx`의 `feed_slot` Suspense 폴백을 **FeedSlot 레이아웃에 맞춘 스켈레톤**(카드 그리드 `animate-pulse`)으로 교체. 231 `loading.tsx` 톤(회색, 마젠타 없음)과 일관.
- (선택) 다른 섹션 Suspense도 `fallback={null}` 대신 얇은 스켈레톤이면 더 매끄럽지만, 최소 스코프는 feed_slot만.

## 3. 회귀 가드
- **데이터 결과 동일**(getUser dedupe·쿼리 순서 병렬화·폴백만 교체).
- `getCachedUser()`는 요청 단위 메모이즈라 사용자별 격리 정상(요청마다 새 캐시).
- FeedSlot 분기(new/skipped/기존) 동작 불변.
- 각 섹션 빈 상태·조건부 렌더 불변.
- 인증 실패/미로그인 가드 유지(미들웨어 + null 가드).

## 4. 검증
- `npx tsc --noEmit` 0, `npx eslint`(수정/신규) 0, `npm run build`.
- 홈 전환 시 getUser 왕복 감소(로그·체감), "로딩 중..." 사라지고 스켈레톤→콘텐츠가 빠르게.

## 5. 라이브 체크리스트
- [ ] 홈 진입 시 인증 왕복 1회(섹션별 중복 없음).
- [ ] 각 섹션·피드가 눈에 띄게 빨리 뜸.
- [ ] "로딩 중..." 텍스트 박스 → 스켈레톤.
- [ ] 모든 홈 섹션 데이터·빈상태 회귀 없음.

SQL 없음. 콘텐츠 탭 초기 로드는 232 Part B(별개).
