# 지시서 49 — 크롤러 불필요기사 필터: EXCLUDE 블랙리스트 (묶음 A · P0-2 1차)

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Claude Code) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전 `AGENTS.md` + `src/lib/crawler/quality.ts` + `src/lib/crawler/orchestrator.ts`(품질필터 단계 L288~294, import L8) 를 읽을 것. `npm install` 먼저.
> **DB 변경 없음** — 순수 lib 코드. SQL 핸드오프 무관, 즉시 진행 가능.

---

## 배경

근거 문서: `docs/뉴스수집-웹인사이트-개선안-2026-06-13.md` (P0-2).

현재 크롤러는 **관련도 게이트가 OFF**(`RELATEDNESS_GATING_ENABLED = false`)라 모든 기사를 무조건 `published` 로 적재한다. 품질 필터는 `isAdLike`(광고 3패턴) + `effectiveLength < 30` 두 가지뿐 → **연예·스포츠·부동산·운세 같은 도메인 무관 기사가 그대로 노출**된다. 이게 "불필요 기사 유입"의 직접 원인.

이 지시서는 게이트를 켜지 않고(임계값 판정 X), **명백히 도메인 무관한 기사만 제목 기준으로 하드 reject** 하는 블랙리스트를 추가한다. 가중 관련도 점수화 + 게이트 ON 은 **묶음 B**에서 별도로 다룬다(이 지시서 범위 밖).

### 설계 원칙 (반드시 지킬 것)
1. **게이트 플래그는 건드리지 않는다.** `RELATEDNESS_GATING_ENABLED` 는 `false` 유지. `relatednessScore()` 도 수정하지 않는다(묶음 B 대상).
2. **블랙리스트는 제목(title)에만 적용한다.** 본문까지 매칭하면 정상 기사가 오탐된다(예: "LG U+, 프로축구단 후원" 은 본문에 '축구'가 있어도 정상 기사). 도메인 무관 여부는 제목으로 판별 가능.
3. **오탐 시 reject 하지 않는 쪽으로 보수적으로.** 게이트가 꺼져 있어 이 블랙리스트가 유일한 도메인 필터다. 애매하면 통과시킨다(양질 기사 손실 > 잡기사 약간 통과). 패턴은 "보수적 시작 → 운영 보며 확장".
4. 적용 대상 경로는 `crawlOne`(news_site·opinion_channel). 유튜브·리포트 경로는 무관.

---

## 작업

### 1. `src/lib/crawler/quality.ts` — EXCLUDE 패턴 + 판정 함수 추가

기존 `AD_PATTERNS`/`isAdLike` 아래에 신설. 형식은 `AD_PATTERNS` 와 동일하게 정규식 배열 + 판정 함수.

```ts
/**
 * 도메인 무관(B2B 텔레콤/엔터프라이즈와 무관) 기사 제외 패턴.
 * - 제목에만 적용한다(본문 적용 금지 — 오탐 원인).
 * - 게이트(RELATEDNESS_GATING_ENABLED)와 무관한 하드 reject.
 * - 보수적으로 시작: 명백한 연예·스포츠·부동산·운세·복권 류만.
 *   애매하면 추가하지 말 것(양질 기사 손실 방지).
 * - 추후 어드민에서 편집 가능하도록 filter_patterns 테이블로 이전 예정(묶음 A 후속).
 */
const EXCLUDE_TITLE_PATTERNS: RegExp[] = [
  // 연예·가십
  /(연예|아이돌|걸그룹|보이그룹|데뷔무대|열애설|결별설|이혼설|컴백 무대)/,
  // 스포츠
  /(프로야구|KBO|프로축구|K리그|국가대표.*(축구|야구)|골프 대회|승부조작|MVP 수상)/i,
  // 부동산
  /(아파트 분양|청약 경쟁률|전세사기|매매가|집값 (상승|하락))/,
  // 운세·복권·날씨
  /(오늘의 운세|로또 \d+회|복권 당첨|주간 날씨|미세먼지 농도)/,
]

/**
 * 도메인 무관 제목 여부. EXCLUDE_TITLE_PATTERNS 중 하나라도 매칭되면 true.
 * @param title 기사 제목(본문 넣지 말 것).
 */
export function isExcludedTitle(title: string): boolean {
  return EXCLUDE_TITLE_PATTERNS.some(p => p.test(title))
}
```

- 위 패턴은 **출발점**이다. 더 늘리지 말고 이대로 시작(운영 보며 묶음 A 후속에서 DB화·확장).
- 정규식은 한국어 부분일치 특성상 단어가 길수록 안전. 짧은 단어("골프", "분양" 단독)는 오탐 위험 → 위처럼 **수식어를 붙여** 좁힐 것.

### 2. `src/lib/crawler/orchestrator.ts` — 품질 필터 단계에 연결

import 갱신(L8): `isExcludedTitle` 추가.

```ts
import { isAdLike, isExcludedTitle, effectiveLength, relatednessScore, MIN_EFFECTIVE_LENGTH, RELATEDNESS_THRESHOLD, RELATEDNESS_GATING_ENABLED } from './quality'
```

품질 필터 단계 1(현재 L288~294)에서 `isExcludedTitle(item.title)` 을 reject 조건에 **OR 추가**. **제목만** 넘긴다(qText 금지).

```ts
// 품질 필터 단계 1: 광고성·짧은 글·도메인무관 제외 (#13, 지시서 49)
const qText = `${item.title} ${item.body ?? ''}`
if (
  isAdLike(qText) ||
  isExcludedTitle(item.title) ||   // ← 신규: 제목 기준 도메인 무관 제외
  effectiveLength(item.title, item.body ?? null) < MIN_EFFECTIVE_LENGTH
) {
  counts.rejected++
  continue
}
```

- 제외 시 기존과 동일하게 `counts.rejected++` 후 `continue`. 별도 카운터·로그 불필요(rejected 에 합산).
- (선택) 디버깅 편의로 `console.log` 한 줄 정도는 허용하나 과하면 생략.

---

## 회귀 / 주의
- 게이트 동작 불변: `RELATEDNESS_GATING_ENABLED=false` 유지, `held`(pending) 집계 로직 그대로.
- `relatednessScore()` 미수정 확인(묶음 B 대상).
- 정상 도메인 기사(통신·5G·AI·클라우드·보안·경쟁사 동향 등)가 새 패턴에 걸리지 않는지 확인 — 특히 후원/제휴/투자 맥락에서 스포츠·연예 단어가 **본문**에 있어도 제목 기준이라 통과해야 함.
- 유튜브(`crawlYoutube`)·리포트 업로드 경로 영향 없음.

## 완료 조건
- [ ] `quality.ts`: `EXCLUDE_TITLE_PATTERNS` + `isExcludedTitle()` 추가, export
- [ ] `orchestrator.ts`: import 갱신 + 품질필터 단계1에 `isExcludedTitle(item.title)` OR 조건 추가(제목만 전달)
- [ ] 게이트 플래그·`relatednessScore` 미변경
- [ ] 간단 검증: 샘플 제목 배열로 `isExcludedTitle` 결과 육안 확인
      - 제외돼야: "오늘의 운세 6월 13일", "프로야구 LG 트윈스 승리", "아파트 분양 청약 경쟁률 100대 1"
      - 통과해야: "LG U+, 프로축구단 후원 협약", "SKT 5G 가입자 1천만 돌파", "과기정통부 AI 기본법 발표"
      - (방법: 임시 스크립트나 `node -e` 로 함수 호출해 출력 확인 후 스크립트 삭제. 영구 테스트 파일은 만들지 말 것 — 기존 테스트 관행 없음)
- [ ] `npx tsc --noEmit` · `npm run build` · `npm run lint`(신규 경고 0) 통과

## 보고 양식
```
## 완료 보고 — 지시서 49 EXCLUDE 블랙리스트
- 변경 파일: src/lib/crawler/quality.ts, src/lib/crawler/orchestrator.ts
- 구현: EXCLUDE_TITLE_PATTERNS(N개 패턴) + isExcludedTitle, 품질필터 단계1 제목 기준 연결
- 게이트/관련도점수: 미변경 확인
- 검증: tsc · build · lint(신규 0) · 샘플 제목 제외/통과 육안(제외 N / 통과 N)
- 미해결/관찰: <있으면 — 예: 추가 후보 패턴>
```

---

### 다음(묶음 A 잔여 — 이 지시서엔 미포함)
- **50**: 소스/카테고리 4분류 재편(뉴스/리포트/웹인사이트/유튜브) + 뉴스레터 *수집* 카테고리·타입 논리 폐기(발송 기능 유지). 라벨·필터 UI 중심, enum 물리 삭제 X.
- **51**: 어드민 소스/콘텐츠 관리 UX — 소스 행 인라인 수집상태(crawl_logs 조인), 콘텐츠 검토대기 우선·일괄, EXCLUDE/광고 패턴 DB화(`filter_patterns`).
