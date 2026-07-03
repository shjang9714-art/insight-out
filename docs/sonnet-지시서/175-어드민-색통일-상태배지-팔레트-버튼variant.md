# 지시서 175 — 어드민 색 통일 (상태배지 163토큰 · 팔레트 · 버튼 variant)

> 작성: Opus(Cowork) · 2026-07-01 · 레인: 어드민 UI/UX 통일 (색 기반)
> 근거: David "색감·버튼 통일 — 아주 중요". 어드민 감사(상태 배지 하드코딩·불일치, 엔티티/차트 색 hex 산재).
> 협업 루프: 로컬(커밋X). David 위임 → 구현 → Opus 검증 → "커밋". **SQL 없음. LLM 없음. 순수 프레젠테이션.**
> 선행: 163(상태색 토큰)·167(버킷 팔레트)·174(헤더). 스코프: 색 토큰·팔레트·버튼 variant "기반 + 적용". 페이지별 잔여 색은 176+.

---

## 0. 한 줄

어드민의 상태 배지 색을 **163 시맨틱 토큰**(positive/risk/negative/neutral)으로 통일하고(하드코딩 green/yellow/red 제거), 엔티티 타입·카테고리·차트 색을 **단일 팔레트(`lib/admin/palette.ts`)**로 모으며, 주요 액션용 **`brand` 버튼 variant**를 추가해 raw `bg-brand-600` 반복을 정리한다.

## 1. 현행 진단 (검증된 코드 사실)

- 상태 배지 하드코딩·불일치:
  - `AdminContentManager.tsx:67` `STATUS_STYLE`(published `text-green-700`/pending `text-yellow-700`/rejected `text-red-600`).
  - `CrawlLogsTable.tsx:47` `STATUS_BADGE`(success `bg-green-50 text-green-700 border-green-100`…) + `:54` 콘텐츠 상태 배지 별도.
  - 브리핑/이슈/인사이트 상태 배지도 각자 색(파일별 산재).
- 범주 색 hex 산재: `EntityManager` 엔티티 타입 배지(일부 토큰·일부 `bg-blue-50` 등), `DashboardCharts.tsx:40` `CAT_COLORS`(#4f86c6…), `LlmManager` 차트 바 `#E6007E`/`#94a3b8`.
- **163 상태색 토큰 존재**: `--color-positive/-soft`·`--color-risk/-soft`·`--color-negative/-soft`(라이트·다크). → 재사용.
- **Button**(`components/ui/button.tsx`)은 cva variant 보유(default=`bg-primary`, destructive 등). **단 `brand`(브랜드 핑크) variant 없음** → 어드민은 raw `bg-brand-600 text-white` className 사용.
- 삭제 확인은 대부분 `window.confirm` 로 이미 존재(이번 범위 아님).

## 2. DB / SQL

**없음.**

---

## 3. 구현

### 3-1. 상태 배지 통일 — `lib/admin/status-style.ts` + `StatusBadge`
```ts
export type Tone = 'positive' | 'risk' | 'negative' | 'neutral'
export const TONE_BADGE_CLS: Record<Tone, string> = {
  positive: 'bg-positive-soft text-positive',
  risk:     'bg-risk-soft text-risk',
  negative: 'bg-negative-soft text-negative',
  neutral:  'bg-muted text-muted-foreground',
}
```
도메인 상태 → tone 매핑(라벨 유지, 색만 토큰):

| 도메인 | 값 | 라벨 | tone |
|---|---|---|---|
| 콘텐츠 | published / pending / rejected | 노출 / 검토 대기 / 숨김 | positive / risk / negative |
| 크롤 | success / partial / failed | 성공 / 부분 / 실패 | positive / risk / negative |
| 브리핑 | 공개 / 초안 / 보관 / 실패 | (유지) | positive / neutral / neutral / negative |
| 이슈 | published / draft / archived | 발행 / 초안 / 보관 | positive / neutral / neutral |
| 인사이트 | published / draft / archived | 발행 / 초안 / 보관 | positive / risk(초안=처리필요 강조) / neutral |

- `components/admin/ui/StatusBadge.tsx`: `<StatusBadge tone={t} label={l} />` → pill(`inline-flex rounded-full px-2 py-0.5 text-xs font-medium` + `TONE_BADGE_CLS[tone]`).
- 각 매니저의 `STATUS_STYLE`/`STATUS_BADGE`를 status-style 맵으로 교체, 렌더는 `StatusBadge` 사용. **하드코딩 green/yellow/red 상태색 제거.**

### 3-2. 범주 팔레트 — `lib/admin/palette.ts`
```ts
// 엔티티 타입 배지(167 버킷 방식, 저채도 + dark 변형)
export const ENTITY_TYPE_CLS: Record<EntityType, string> = {
  company:  'bg-brand-600/10 text-brand-600',
  tech:     'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  product:  'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  person:   'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  policy:   'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  industry: 'bg-muted text-muted-foreground',
}
// 차트 시리즈(recharts는 색 문자열 필요 → hex 단일 상수로 집약, 유일 예외)
export const CHART_CATEGORY: Record<string, string> = {
  뉴스: '#4f86c6', 리포트: '#f4a261', 웹인사이트: '#57cc99', 유튜브: '#e76f51', 'AI보고서': '#9b5de5',
}
export const CHART_BRAND = '#E6007E'
export const CHART_MUTED = '#94a3b8'
```
- `EntityManager` 엔티티 타입 배지 → `ENTITY_TYPE_CLS`. `DashboardCharts`/`LlmManager` 차트 색 → palette 상수 참조(파일 내 hex 정의 제거, import).
- **차트 hex는 palette.ts 한 곳에만 허용**(recharts 특성 — 163 canvas 예외와 동일 논리). 컴포넌트 내 신규 hex 0.

### 3-3. Button `brand` variant
- `button.tsx` variants 에 `brand: "bg-brand-600 text-white hover:bg-brand-700"` 추가.
- 어드민 주요 액션(생성·실행·저장·미리보기)에서 raw `bg-brand-600 text-white` className을 **`<Button variant="brand">`** 로 점진 교체 가능(이번엔 variant 추가 + 대표 몇 곳 교체까지; 전수 교체는 176+ 페이지 적용 때). 위험 액션은 기존 `destructive` variant 권장.

### 3-4. 잔여 하드코딩(에러 박스 등)
- 에러 알림 박스의 `border-red-100 bg-red-50 text-red-600` 다수 → `negative-soft`/`negative` 토큰로 교체(status-style와 일관). 대표 위치부터, 전수는 176+.

---

## 4. 회귀 가드 / 비기능 요건

- **기능·라벨 변화 0** — 색 표현만 토큰/팔레트로. 상태 값·로직 무변경.
- 같은 의미=같은 tone(성공은 어디서나 positive). 다크·라이트 양쪽 대비 확보(163 토큰이 처리).
- 차트 색은 palette.ts 단일 출처. 컴포넌트 내 신규 hex 0(차트 포함 팔레트 경유).
- 버튼 variant 추가는 기존 버튼 동작 무변경(스타일 클래스만).
- StatusBadge 미적용 잔여 배지는 176+에서 마저(이번엔 상태 배지 주요 사이트 + 팔레트).

## 5. 검증 (Sonnet 자체)

1. `npx tsc --noEmit` 0 / `npx eslint` 0
2. `grep -rnE "text-green-700|text-yellow-700|bg-green-50|bg-yellow-50" src/components/admin` → 상태 배지 사이트에서 0(차트·특수 잔여는 사유 명시)
3. 콘텐츠/크롤/브리핑/이슈/인사이트 상태 배지가 positive/risk/negative/neutral 토큰으로 표시(다크·라이트)
4. 엔티티 타입 배지·차트 색이 palette.ts 단일 출처 사용, 컴포넌트 내 신규 hex 0
5. `<Button variant="brand">` 렌더 정상, 대표 액션 색 동일
6. 상태 의미별 색이 서로 구분(성공 vs 실패 vs 주의)

## 6. 후속 (범위 밖)

- 176 콘텐츠·수집 그룹: 잔여 배지/에러박스/버튼 전수 적용 + 트랙 B(수집 품질) 착지.
- 177 나머지 그룹 + 차트 다크모드 색 최적화.
- 삭제 확인을 window.confirm → AlertDialog 컴포넌트로 격상(선택).

## 7. 라이브 검증 체크리스트 추가분

- [ ] 콘텐츠·크롤·브리핑·이슈·인사이트 상태 배지 색이 통일(성공=민트/주의=오렌지/실패=레드/중립=회색)
- [ ] 라이트·다크 양쪽 배지 가독성 OK
- [ ] 엔티티 타입 배지·대시보드 차트 색이 일관(팔레트 단일화)
- [ ] 주요 액션 버튼 색 동일(brand)
