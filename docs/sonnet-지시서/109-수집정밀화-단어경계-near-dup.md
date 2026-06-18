# 지시서 109 — 수집 정밀화: 단어경계 매칭 + near-dup 후보 풀 수정

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Claude Code) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전 다음을 읽을 것: `AGENTS.md` · `src/lib/crawler/quality.ts`(matchKeywordGroups·relatednessScore·isExcludedByGroups — 매칭부) · `src/lib/crawler/dedup.ts`(findSimilarCandidates — 후보 풀) · `src/lib/crawler/similarity.ts`(titleSimilarity·sharesCoreTokens — 판정, 변경 없음) · `src/lib/crawler/orchestrator.ts`(L335~350 near-dup 결정·L416 importance). `npm install` 먼저.
> **신규 SQL 없음.** 크롤러 매칭·중복 로직 정밀화. 코드만.

---

## 배경 (David)

(1) **취지에 안 맞는 기사**가 들어오고 (2) **유사/중복 기사**가 많이 들어옴. 코드 점검 결과 원인 두 가지:

- **무관 기사**: 매칭이 `text.includes(pattern)` **부분문자열**이라, keyword_groups 의 **짧은 패턴("AI","RAG","POS","REC","MES","IDC","AX","DX","DT")**이 "s**ai**d / sto**rag**e / **POS**co / co**mes**" 등에 오탐. 노이즈로 관련도 점수가 부풀어 임계(0.3) 통과 → published. (importance_score 가 전부 1로 균일했던 것도 동일 원인 — 노이즈로 점수가 캡(1)에 붙음.)
- **중복 기사**: near-dup 후보 조회(`findSimilarCandidates`)가 `published_at >= sinceIso` 로만 거름 → **`published_at = null` 인 RSS 기사가 후보에서 통째 제외** → 비교 대상이 안 돼 클러스터 미형성. (판정 함수 `sharesCoreTokens` 자체는 이미 느슨해서 후보에만 들어오면 묶임.)

## 설계 결정 (Opus)

1. **단어경계 매칭**: **짧은 ascii 패턴(≤4자, 영숫자만)**은 단어경계로만 매칭, **긴 패턴·한글은 substring 유지**. → 오탐 차단 + 점수 변별 복원(importance 도 자연 정상화).
2. **near-dup 후보 풀 수정**: `collected_at` 기준(항상 존재)으로 후보 조회 → `published_at` 유무와 무관하게 최근 기사 전부 비교. 판정(`titleSimilarity≥0.9 || sharesCoreTokens`)은 그대로.
3. **keyword_groups 데이터 정리는 운영**(어드민 63): "AI" 같은 광역 패턴은 include 에서 빼거나 weight 0 — 코드만으론 한계라 병행 권장(이 지시서 범위 밖, 안내만).
4. 신규 SQL 없음. 게이팅 임계(0.3)·SIMILARITY_THRESHOLD(0.9)는 유지(후보 풀·매칭만 고침).

---

## 작업

### 1. 단어경계 매칭 — `src/lib/crawler/quality.ts`
- 헬퍼 추가:
  ```ts
  function escapeRegex(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
  /** 짧은 영숫자 패턴(≤4자)은 단어경계, 그 외(긴 패턴·한글 포함)는 substring */
  export function patternHit(textLower: string, pattern: string): boolean {
    const p = pattern.trim().toLowerCase()
    if (!p) return false
    if (/^[a-z0-9]{1,4}$/.test(p)) {
      // 앞뒤가 영숫자가 아니면 매칭(한글 인접은 허용: "AX전략" O, "maximum" X, "said" X)
      return new RegExp(`(?<![a-z0-9])${escapeRegex(p)}(?![a-z0-9])`, 'i').test(textLower)
    }
    return textLower.includes(p)
  }
  ```
- 적용(전부 `xxx.includes(p.toLowerCase())` → `patternHit(xxx, p)`):
  - `matchKeywordGroups`: `text.includes(p.toLowerCase())` → `patternHit(text, p)`.
  - `relatednessScore`: `titleLower.includes(p.toLowerCase())`·`bodyLower.includes(...)` → `patternHit(titleLower, p)` / `patternHit(bodyLower, p)`. (text 는 이미 lower 이므로 patternHit 내부 lower 와 무방.)
  - `isExcludedByGroups`: `lower.includes(p.toLowerCase())` → `patternHit(lower, p)`.
- 한글 패턴(예 "데이터센터","AI 데이터센터"=공백 포함 → 길이>4 → substring)·긴 영문("Microsoft")은 그대로 substring(정상).

### 2. near-dup 후보 풀 수정 — `src/lib/crawler/dedup.ts`
- `findSimilarCandidates`: 후보 조회 기준을 `published_at` → **`collected_at`** 로(항상 존재). 즉:
  - `sinceIso = baseMs - sinceDays*일`(기존 유지). `baseMs` 는 `publishedAt ?? Date.now()`.
  - 쿼리: `.eq('category','뉴스').gte('collected_at', sinceIso).order('collected_at', desc).limit(500)`. (published_at null 행도 포함됨.)
  - select 에 `collected_at` 추가(타입 SimilarityCandidate 에도). 정렬 collected_at desc.
- (선택) `sinceDays` 기본 2 → **3**(같은 사건 보도가 며칠 걸쳐 들어오는 경우 포착). 과하면 2 유지.
- 판정부(orchestrator L340)·`sharesCoreTokens`·SIMILARITY_THRESHOLD 는 **변경 없음**.

### 3. (운영 안내 — 코드 아님) keyword_groups 정리
- 보고서/완료 메모에 "어드민(63) 키워드그룹 관리에서 'AI' 등 광역 패턴 include 제거/weight 0 권장" 명시. (코드 단어경계로 1차 차단되나, 데이터 정리가 근본.)

## 회귀 / 주의
- **단어경계는 짧은 ascii(≤4자)에만** — 한글/긴 패턴 substring 유지(기존 정상 매칭 깨지지 않게). 정규식 lookbehind `(?<!…)`는 최신 Node 지원(Vercel Node 런타임 OK).
- 패턴에 정규식 특수문자 있을 수 있음 → `escapeRegex` 필수.
- near-dup 후보를 collected_at 로 넓히면 비교 건수↑ 가능 — limit 500·정렬로 바운디드. 과부하 시 sinceDays 축소.
- 게이트 임계·유사도 임계 불변(이 슬라이스는 매칭 정확도·후보 풀만). 임계 튜닝은 데이터 보고 별도.
- 같은 사건·다른 헤드라인의 대량 보도(KT 부울경 10건 등)는 후보 풀 수정으로 상당수 묶이나, 헤드라인이 많이 다르면 일부 잔존 → **엔티티/사건 기반 클러스터링은 후속(110)**.
- 기존 적재분은 소급 안 됨(다음 수집부터). 필요시 재수집(86).
- UI/주석 한국어(#1)·`any` 금지.

## 완료 조건
- [ ] `patternHit`(단어경계+escape) + matchKeywordGroups·relatednessScore·isExcludedByGroups 적용
- [ ] `findSimilarCandidates` collected_at 기준(+select·타입·정렬), (선택)sinceDays 3
- [ ] `npx tsc --noEmit` · `npm run build` · `npm run lint`(신규 0) 통과
- [ ] 육안/로그: "AI"가 "said"류에 오탐 안 됨 · 같은 사건 기사 cluster_id 묶임 · importance_score 변별(전부 1 아님)

## 보고 양식
```
## 완료 보고 — 지시서 109 수집 정밀화
- SQL: 없음
- 변경: crawler/quality.ts(patternHit 단어경계·3곳 적용), crawler/dedup.ts(후보 풀 collected_at)
- 무관기사: 짧은 ascii 패턴 단어경계 → 오탐 차단·importance 변별 복원 / 중복: null published_at 포함 후보 풀 → 클러스터 형성
- 검증: tsc · build · lint(신규 0) · (다음 수집 후) 육안
- 운영 권장: 어드민(63)에서 'AI' 등 광역 패턴 정리(weight 0/제거)
- 미해결: 엔티티/사건 기반 클러스터링(110) · 게이트 임계 튜닝 · 기존분 재수집(86)
```

---

### 메모(후속)
- **110 — 사건 기반 클러스터링**: 같은 엔티티 집합 + 같은 날 + 토픽 중첩으로 "같은 사건 다른 헤드라인" 묶기(99 엔티티 활용). 헤드라인 jaccard 한계 보완.
- 게이트 임계(0.3)·유사도(0.9) 데이터 보고 후 튜닝.
- 관련: B1(51)·near-dup(67)·EXCLUDE(49)·99(엔티티)·정밀매칭(93/94/96 누적 후속).
