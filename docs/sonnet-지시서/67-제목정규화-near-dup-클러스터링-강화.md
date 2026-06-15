# 지시서 67 — 제목 정규화(출처 접미사 제거) + near-dup 클러스터링 강화(핵심 토큰 공유)

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Claude Code) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전 `AGENTS.md` + `src/lib/crawler/similarity.ts`(tokenize·jaccard·titleSimilarity·SIMILARITY_THRESHOLD) + `src/lib/crawler/orchestrator.ts`(processCrawlItem near-dup 블록 ~332행) + `src/lib/crawler/dedup.ts`(findSimilarCandidates) + `src/lib/crawler/adapters/news-site.ts` 를 읽을 것. `npm install` 먼저.
> **DB 변경 없음**(기존 `cluster_id`·컬럼 사용). 단독 커밋 가능.

---

## 배경

같은 사건의 기사 3건(예: "네이블 … 하나금융 5G 특화망 …")이 각자 published 로 들어옴. 원인:
1. **Google News 출처 접미사**(`- 뉴스티앤티`, `- TopStarNews`, `- 디지털투데이`)가 매번 다른 토큰 → 유사도↓.
2. 매체별 표현 차이(`특징주·SK텔레콤과` / `2억·4천만·원대` / `사업·체결`).
→ Soft Jaccard 유사도 ≈ 0.4~0.5 인데 `SIMILARITY_THRESHOLD = 0.9` 라 클러스터 미형성 → 3건 모두 노출.

near-dup 은 **스킵이 아니라 cluster_id 그룹핑**(대표 1 + 관련 N) 설계지만, 애초에 안 묶이는 게 문제.

### 설계 결정(David 확정)
- (b) **핵심 토큰 공유 규칙** 추가(threshold 0.9 무차별 하향 대신 — 오탐 적음).
- 제목에서 **출처 접미사 제거**를 저장 단계에 적용(유사도·해시·표시 모두 개선).

## 작업

### 1. 제목 정규화 — 출처 접미사 제거
- `src/lib/crawler/similarity.ts`(또는 새 util)에 `stripSourceSuffix(title: string): string` 추가:
  - 끝의 ` - 매체명` / ` | 매체명` 패턴 1개 제거. 보수적 정규식(매체명이 과도하게 길거나 하이픈 포함이면 보존): 예 `/\s[-|]\s[^-|–—]{1,25}\s*$/` 매칭 시 제거. 본문 하이픈(예: "AI-반도체")은 양옆 공백 기준이라 안 건드림.
  - trim.
- **저장 단계 적용**(`adapters/news-site.ts`): `const title = stripSourceSuffix(item.title ?? '')` 로 저장(표시 제목도 깔끔 + 카드/유사도/해시 일관). title 빈 값이면 기존대로 skip.
  - ⚠️ 일반 뉴스사이트 RSS 제목엔 접미사가 없을 수 있으니, 보수적 정규식으로 **매칭될 때만** 제거(미매칭이면 원본 유지).

### 2. 클러스터링 강화 — 핵심 토큰 공유 규칙
- `similarity.ts` 에 `sharesCoreTokens(t1, t2): boolean` 추가:
  - `tokenize` 재사용(불용어·1글자·기호 제거). softMatch 교집합 개수 `shared` 계산(jaccard 의 교집합 로직 재사용/추출).
  - 판정: `shared >= CORE_MIN_SHARED(=3)` **AND** `shared / Math.min(lenA, lenB) >= CORE_MIN_RATIO(=0.5)`.
  - 짧은 제목(유효 토큰 < 3) 은 false(오탐 방지).
  - 상수 `CORE_MIN_SHARED = 3`, `CORE_MIN_RATIO = 0.5` export.
- `processCrawlItem` near-dup 매칭(현 `candidates.find(c => titleSimilarity(...) >= SIMILARITY_THRESHOLD)`)을:
  ```
  const match = candidates.find(c =>
    titleSimilarity(c.title, item.title) >= SIMILARITY_THRESHOLD ||
    sharesCoreTokens(c.title, item.title)
  )
  ```
  - 비교 대상 제목은 **정규화된 형태**(저장 title 이 이미 정규화됐고, candidates.title 도 저장본이라 일관). item.title 도 stripSourceSuffix 적용본 사용(1번에서 title 변수가 이미 정규화됐다면 그대로).

### 3. (확인) 피드 cluster 접힘
- 사용자 피드/목록이 `cluster_id` 로 **대표 1건만 노출 + 관련 N 표시**하는지 확인. 이미 그렇게 동작하면 무변경(보고에 명시). 안 접히면 그건 **후속 별도 지시서**(이번 범위 밖, 보고에 기록).
- 어드민(`/admin/contents`)은 전수 표시 유지(운영자가 다 봐야 함) — 변경 없음.

## 회귀 / 주의
- DB 무변경. 기존 해시 완전일치 dedup·게이트·요약·시그널·번역 불변.
- 핵심 토큰 규칙은 ratio 조건으로 "클라우드·AI·기업" 같은 일반어 3개만 겹치는 오탐을 억제. 그래도 과묶임 의심되면 `CORE_MIN_SHARED`↑ 또는 `CORE_MIN_RATIO`↑ 로 조정(상수).
- 출처 접미사 제거는 보수적 정규식 — 정상 제목 훼손 0 목표. 애매하면 미제거(원본 유지).
- 기존 적재분(이미 분리된 3건)은 소급 병합 안 됨(이번 수집부터 적용). 필요 시 백필은 후속.

## 완료 조건
- [ ] `stripSourceSuffix` + 저장 단계 적용(news-site.ts), 보수적 매칭
- [ ] `sharesCoreTokens`(CORE_MIN_SHARED·CORE_MIN_RATIO) + processCrawlItem 매칭에 OR 결합
- [ ] 피드 cluster 접힘 여부 확인·보고
- [ ] `npx tsc --noEmit` · `npm run build` · `npm run lint`(신규 0) 통과
- [ ] 육안: "지금 수집" → 같은 사건 다매체 기사가 한 cluster 로 묶임(대표+관련) / 제목 접미사 사라짐

## 보고 양식
```
## 완료 보고 — 지시서 67 제목 정규화 + near-dup 강화
- 변경 파일: <목록>
- stripSourceSuffix(저장 적용)·sharesCoreTokens(핵심토큰 공유)·processCrawlItem 매칭 결합
- 피드 cluster 접힘: <됨/안됨(후속)>
- DB 무변경 · 검증: tsc · build · lint(신규 0)
- 미해결: 기존 적재분 소급 병합·피드 접힘(해당 시)
```

---

### 메모(후속)
- 표현이 많이 다른 동일 사건은 LLM 의미 dedup 으로 보강 가능(후속, 비용 고려).
- 기존 미분리 적재분 cluster 백필 스크립트(선택).
- 관련: [[insight-out-뉴스수집-개선-로드맵]]
