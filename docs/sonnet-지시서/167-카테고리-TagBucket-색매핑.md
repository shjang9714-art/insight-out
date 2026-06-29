# 지시서 167 — 카테고리(TagBucket) 색 매핑

> 작성: Opus(Cowork) · 2026-06-28 · 레인: AI 인사이트 IA 개선 (UI 마무리)
> 근거: 설계안 §6-2(카테고리 칩 색 분산). David 결정(2026-06-28): **TagBucket 4분류 기반**(개별 토픽명이 아니라 구조화된 버킷으로 — 새 토픽에도 안 깨짐).
> 협업 루프: 로컬(커밋X). David 위임 → 구현 → Opus 검증 → "커밋". **SQL 없음. LLM 없음.**
> 선행: 163(색 토큰)·164(카드)·165(필터). 인텔 화면 한정(전 앱 칩 sweep은 후속).

---

## 0. 한 줄

토픽/카테고리 칩의 핑크·중립 일변도를 **TagBucket(기술/시장·정책/업체/일반)별 저채도 색**으로 분산한다. 버킷별 색 매핑을 정의하고, 인사이트 카드의 카테고리 칩과 키워드 칩에 적용한다. 설계안 §6-2 표(AI/AIDC/보안…)는 고정 enum이 아니므로, 그 의도를 **구조화된 4버킷 색**으로 구현.

## 1. 현행 진단 (검증된 코드 사실)

- 버킷 체계: `src/lib/tag-buckets.ts` — `TagBucket = '기술'|'시장·정책'|'업체'|'일반'`, `tagTypeToBucket(tag_type)`(tech→기술, market/policy→시장·정책, company→업체, 그 외→일반). **버킷별 색 매핑은 없음.**
- 토픽→버킷 산출: `AiInsightsView.tsx` 의 `patternTagMap`(keyword_groups name/include_patterns → tag_type) + `tagTypeToBucket` 로 `classifiedKeywords[].bucket` 이미 계산 중.
- 칩 렌더 현황:
  - 인사이트 카드 카테고리 칩(164, `InsightCardsSectionClient` 273·330): `card.topic`, **중립**(`bg-muted text-muted-foreground`). **bucket 정보 미보유**(카드 데이터에 없음 → 매핑 배선 필요).
  - 키워드 strip(`AiInsightsView` kwStrip, 브리핑 ④): `classifiedKeywords`(bucket 보유)인데 현재 **방향색(▲ positive/▽ negative)만** 사용, 버킷색 미사용.
  - `KeywordMap.tsx`: **미사용 컴포넌트**(타입 `KeywordItem` 만 import됨). 내부에 163 이전 하드코딩(`bg-red-50`·`text-emerald-600`) 잔존.

## 2. DB / SQL

**없음.**

---

## 3. 구현

### 3-1. `tag-buckets.ts` — 버킷 색 매핑(저채도)
범주형 색이므로 Tailwind 저채도 유틸 클래스 매핑(상태색 토큰과 구분 — 긍/부정 아님). 다크/라이트 변형 포함:

```ts
export const BUCKET_CHIP_CLS: Record<TagBucket, string> = {
  '기술':      'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  '시장·정책': 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  '업체':      'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  '일반':      'bg-muted text-muted-foreground',
}
// 점(범례)용 단색 변형도 필요시 BUCKET_DOT_CLS 로 추가
```
- 설계안 §6-2 방향(기술=블루, 시장·정책=앰버, 업체=슬레이트, 일반=중립)과 일치. 보안/통신 같은 세부는 4버킷에 흡수.
- **상태색(positive/risk/negative, 163)과 색상 충돌 없게** — 버킷색은 blue/amber/slate(범주), 상태색은 mint/orange/red(의미). 라이브에서 대비 확인.

### 3-2. 토픽→버킷 배선 (카드 카테고리 칩)
`InsightCardsSectionClient` 에 옵셔널 `bucketByTopic?: Record<string, TagBucket>` prop 추가. 카드 카테고리 칩 클래스를:
```tsx
const bucket = bucketByTopic?.[card.topic] ?? '일반'
// <span className={cn('rounded px-2 py-0.5 text-xs font-medium', BUCKET_CHIP_CLS[bucket])}>{card.topic}</span>
```
- **브리핑(`AiInsightsView`)**: `patternTagMap` 으로 카드 topic 들의 버킷 맵을 만들어 prop 전달.
- **관심기업(`entities/page.tsx`)**: 동일 패턴으로 keyword_groups tag_type 경량 조회 → `bucketByTopic` 구성해 전달. (이미 AiInsightsView 가 쓰는 쿼리와 동일 — 복붙 수준. 부담되면 생략 시 `?? '일반'` 으로 graceful 중립.)
- map 없으면 '일반'(중립) 폴백 — 절대 깨지지 않음.

### 3-3. 키워드 strip 버킷색 (`AiInsightsView` kwStrip)
kwStrip 칩 배경을 `BUCKET_CHIP_CLS[kw.bucket]` 로(범주 구분), **방향 화살표 ▲▽ 는 positive/negative 색 유지**(증감 의미). 즉 배경=버킷색, 화살표=방향색 — 두 정보 동시 표현. 과밀하면 배경만 옅게.

### 3-4. `KeywordMap.tsx` 정리
미사용 컴포넌트. 두 길 중:
- (권장) 컴포넌트 본체 삭제하고 `KeywordItem` 타입만 `tag-buckets.ts` 또는 `lib/types.ts` 로 이동(import 경로 갱신: `AiInsightsView`).
- 또는 보존하되 내부 하드코딩(`bg-red-50`·`text-emerald-600`·`text-red-400`)을 163 토큰/버킷색으로 교체.
- **둘 중 하나로 잔재 정리**(죽은 코드 + 163 이전 색 동시 해소).

---

## 4. 회귀 가드 / 비기능 요건

- 데이터 변경 0. bucketByTopic 없거나 토픽 미매칭 → '일반' 중립(깨짐 0).
- 버킷색 ≠ 상태색: 같은 화면에서 "기술(블루) 칩" 과 "긍정(민트) 배지" 가 구분되게.
- 라이트/다크 양쪽 대비 확보(dark: 변형 포함).
- 인텔 화면 한정 — 콘텐츠 출처 칩(ContentCategory)·전 앱 칩은 본 지시서 범위 밖.
- 신규 하드코딩 hex 0(Tailwind 유틸 클래스 사용). SQL/LLM 0. 미사용 코드 0(KeywordMap 정리 포함).

## 5. 검증 (Sonnet 자체)

1. `npx tsc --noEmit` 0 / `npx eslint` 0
2. 인사이트 카드 카테고리 칩이 버킷별 색(기술=블루·시장정책=앰버·업체=슬레이트·일반=중립)으로 분산
3. 브리핑·관심기업 양쪽 카드에서 동작(관심기업은 graceful 중립 허용)
4. 키워드 strip 칩이 버킷색 배경 + 방향 화살표색 유지
5. 버킷색과 상태색(긍/부정)이 시각적으로 구분됨
6. `KeywordMap` 죽은 코드/163 이전 색 잔재 해소(삭제 또는 토큰화), import 깨짐 0
7. 라이트·다크 양쪽 가독성

## 6. 후속 (범위 밖)

- 콘텐츠 출처 칩(ContentCategory 6종) 색 매핑.
- 전 앱 칩/핑크 sweep.
- 버킷색을 globals.css 토큰으로 승격(현재 유틸 클래스).
- 세부 토픽(AI/AIDC/보안…) 큐레이션 색(토픽→색 매핑 테이블 — 유지비 큼, 보류).

## 7. 라이브 검증 체크리스트 추가분

- [ ] 인사이트 카드 카테고리 칩이 버킷별 색으로 구분된다(핑크 일변도 해소)
- [ ] 키워드 strip이 버킷색 + 증감 화살표색을 함께 보여준다
- [ ] 버킷색(블루/앰버/슬레이트)과 상태색(민트/오렌지/레드)이 헷갈리지 않는다
- [ ] 라이트·다크 양쪽에서 칩 가독성 OK
- [ ] 관심기업 탭 카드도 깨지지 않음(색 또는 중립 폴백)
