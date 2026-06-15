# 지시서 64 — B3-2: LLM 관련도 재판정 + 보조 태그 (애매 기사만 게이트 정교화)

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Claude Code) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전 `AGENTS.md` + `src/lib/crawler/orchestrator.ts`(processCrawlItem 게이트·relatednessScore·RELATEDNESS_THRESHOLD·RELATEDNESS_GATING_ENABLED·matchKeywordGroups·번역/요약 budget 패턴) + `src/lib/crawler/summarize.ts`(62 미러 대상) + `src/lib/crawler/quality.ts`(relatednessScore·matchKeywordGroups) + `src/lib/llm/index.ts`(llmComplete) + `docs/묶음B-LLM양질엔진-설계.md`(§2·§5·§6) 를 읽을 것. `npm install` 먼저.
> **DB 변경 없음**(상태 enum·matched_keywords 기존 컬럼 사용, 57 적용됨). 신규 env 없음. 단독 커밋 가능.

---

## 배경

현재 관련도 게이트는 **결정적 점수 1개**(`relatednessScore` = keyword_groups include/exclude/weight 매칭)로 published/pending 을 가른다(B1). 임계값(`RELATEDNESS_THRESHOLD`, 코드상수 0.3) 근처의 **애매한 기사**는 오탐(관련 있는데 보류)·오통과(무관한데 노출)가 생긴다. B2 게이트웨이(`llmComplete('classify')`)가 준비됐으니, **애매 구간 기사에만** LLM 재판정을 적용해 게이트를 정교화하고, 부족한 태그를 **LLM 보조 태그**로 보강한다.

핵심은 **토큰 절약**(설계 §5): 명백히 통과/탈락인 기사는 LLM 안 부르고, **임계값 ±MARGIN 밴드의 애매 기사만** LLM 호출. 신뢰 소스(trust_tier≥2)는 면제. 키 미등록/한도/실패 시 결정적 판정 유지(graceful).

### 설계 결정(Opus)
1. **per-item 호출**(62 요약과 동형 단순 구조). 배치(2단계 리팩토링)는 토큰이 문제될 때 후속 — 애매 밴드+budget 으로 호출량이 이미 작음.
2. **애매 밴드 = `THRESHOLD - MARGIN ≤ score < THRESHOLD + MARGIN`**(예 MARGIN 0.15). 이 구간만 LLM 재판정 → relevant=true면 published, false면 pending. 밴드 밖은 결정적 결과 유지.
3. **insert 전에 재판정**(상태가 insert row 에 확정되도록 — counts(held/inserted) 정합). 애매+budget 일 때만 await 추가.
4. **LLM 보조 태그**는 기존 `matched_keywords`(text[], 57)에 **병합(중복제거·상한)**. 신규 컬럼 없음.
5. **budget**(`classifyBudget`) 을 translation/summarize budget 과 동일하게 runCrawl→crawlOne/crawlKeywordSearch→processCrawlItem 전달. 크롤 1회 상한.
6. **graceful**: llmComplete/JSON 파싱 실패 → null → 결정적 판정·결정적 태그 그대로.

## 작업

### 1. 분류 헬퍼 `src/lib/crawler/classify.ts`
- `classifyRelevance(title: string, snippet: string, groupNames: string[]): Promise<{ relevant: boolean; tags: string[] } | null>`
  - 시스템 프롬프트(고정, 한국어): "당신은 B2B 텔레콤/엔터프라이즈 시장 정보 큐레이터다. 기사가 LG U+ B2B 서비스 담당자에게 관련 있는지 판정하고, 핵심 주제 태그를 0~3개(한국어 명사) 부여하라. 아래 관심 그룹을 참고. **JSON만 출력**: {\"relevant\":true|false,\"tags\":[\"...\"]}. 설명·머리말 금지." + 그룹명 목록을 시스템에 포함(캐싱 유리).
  - user: `제목: {title}\n발췌: {snippet 앞 CLASSIFY_SNIPPET_MAXCHARS(예 300)자}`.
  - `llmComplete('classify', system, user)` → JSON 파싱(try/catch). 코드펜스(```json) 제거 후 파싱하는 방어 포함. 형식 안 맞으면 null.
  - 반환 정규화: relevant=Boolean, tags=문자열 배열 상한 `MAX_LLM_TAGS`(예 3), 공백/중복 제거. 실패·null → null.
- 'server-only'.

### 2. `processCrawlItem` 통합
- 상수(파일 상단): `MAX_LLM_CLASSIFY_PER_CRAWL`(예 40), `RELATEDNESS_MARGIN`(예 0.15), `CLASSIFY_SNIPPET_MAXCHARS`(300), `MAX_LLM_TAGS`(3).
- 게이트 계산부(현 `score`/`exempt`/`contentStatus` 산출 지점) 수정:
  - 기존대로 `score`, `exempt`, 결정적 `contentStatus` 계산.
  - **애매 재판정 조건**: `RELATEDNESS_GATING_ENABLED && !exempt && classifyBudget.remaining > 0 && (THRESHOLD - RELATEDNESS_MARGIN) <= score && score < (THRESHOLD + RELATEDNESS_MARGIN)`.
  - 조건 충족 시: `classifyBudget.remaining--`; `const verdict = await classifyRelevance(item.title, item.body ?? '', activeGroupNames)`.
    - `verdict` 있으면 `contentStatus = verdict.relevant ? 'published' : 'pending'`; `llmTags = verdict.tags`.
    - `verdict` null 이면 결정적 `contentStatus` 유지, `llmTags = []`.
  - 조건 미충족: `llmTags = []`(LLM 미호출).
  - `activeGroupNames` = groups 의 그룹명 배열(이미 로드된 `groups`/`ScoringGroup`에서 추출, 없으면 빈 배열).
- insert row 의 `status` 는 위 최종 `contentStatus` 사용(현행 그대로, 값만 재판정 반영). counts held/inserted 도 최종 상태 기준(현행 분기 그대로).
- **태그 병합**(기존 matched 태그 post-insert update 블록): `matched_keywords` = `[...matchedTags.keywords, ...llmTags]` 중복제거 후 상한(예 8). `matched_groups` 는 결정적 그대로. 기존 try/catch 격리 유지.

### 3. budget 배선
- `classifyBudget: TranslationBudget`(remaining 구조 재사용) 을 runCrawl 에서 `MAX_LLM_CLASSIFY_PER_CRAWL` 로 생성 → crawlOne·crawlKeywordSearch → processCrawlItem 파라미터 추가(translation/summarize budget 옆). 시그니처 3곳 + 호출 3곳 갱신.

## 회귀 / 주의
- DB/상태enum/matched 컬럼 무변경. 밴드 밖·면제·키없음·예산소진 시 **결정적 게이트와 100% 동일 동작**.
- LLM 재판정은 **애매 밴드(±0.15)만** → 대부분 기사는 LLM 미호출(토큰 절약). budget 으로 1회 호출 상한.
- insert 전 await 추가는 애매+budget 기사에 한정 — 크롤 시간 영향 최소.
- JSON 파싱 실패가 흔할 수 있으니(소형 무료 모델) **반드시 graceful null**, 절대 throw/크롤 중단 금지.
- pending 으로 떨어진 것도 어드민 검토 큐(59)에서 수동 승인 가능 — LLM 오판 안전망 존재.
- UI/주석/프롬프트 한국어(#1). 백엔드라 색상/hex 무관.

## 완료 조건
- [ ] `classify.ts`: `classifyRelevance` (llmComplete('classify') + JSON 파싱 방어 + 태그 상한 + null graceful)
- [ ] `processCrawlItem`: 애매 밴드 조건부 재판정(상태 override) + LLM 보조 태그 matched_keywords 병합(중복제거·상한)
- [ ] `classifyBudget` runCrawl→crawlOne/crawlKeywordSearch→processCrawlItem 배선
- [ ] `npx tsc --noEmit` · `npm run build` · `npm run lint`(신규 0) 통과
- [ ] 육안(키 등록 후): "지금 수집" → 애매 기사 일부가 LLM 판정으로 published/pending 재분류 + 보조 태그 부여 / 키 없을 땐 결정적 동일·에러 없음

## 보고 양식
```
## 완료 보고 — 지시서 64 B3-2 LLM 관련도 재판정 + 보조 태그
- 변경 파일: <목록>
- classify.ts(llmComplete classify+JSON방어)·processCrawlItem 애매밴드 재판정·태그병합·classifyBudget 배선
- 밴드밖/면제/키없음 graceful(결정적 동일) 확인 · DB 무변경
- 검증: tsc · build · lint(신규 0)
- 미해결: <키/수집 후 육안 등>
```

---

### 메모(후속)
- 선행 권장: 62·63 배포 + "지금 수집" 1회로 검토대기 비율 확인 → MARGIN·budget·THRESHOLD 튜닝 근거 확보.
- 후속: 배치 호출(토큰 더 절약), 65(시그널 content_signals=신규 SQL), threshold 설정화.
- 관련: [[insight-out-뉴스수집-개선-로드맵]]
