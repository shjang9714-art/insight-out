# 지시서 62 — B3-1: LLM 한국어 요약 (크롤 뉴스 summary_ko 자동 생성)

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Claude Code) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전 `AGENTS.md` + `src/lib/crawler/orchestrator.ts`(processCrawlItem·번역(translateEnglishContent)·MAX_TRANSLATIONS_PER_CRAWL·translationBudget) + `src/lib/llm/index.ts`(llmComplete) + `src/lib/llm/types.ts`(LlmTask) + `docs/묶음B-LLM양질엔진-설계.md`(§2·§5) 를 읽을 것. `npm install` 먼저.
> **DB 변경 없음**(기존 `contents.summary_ko` 컬럼 사용). 신규 env 없음(LLM 키는 B2 게이트웨이가 이미 사용). 단독 커밋 가능.

---

## 배경

크롤로 적재되는 뉴스는 현재 **`summary_ko` 가 비어 있다** — `processCrawlItem` 의 insert row 에 summary_ko 가 없음. 화면은 결정적 요약 폴백(본문 앞부분)으로 때우는 중이라 품질이 낮다. B2(LLM 게이트웨이, 54/55)가 완성돼 `llmComplete('summarize', …)` 가 task별 라우팅 + 폴백 + 사용량 집계까지 준비됨. 이를 크롤 파이프라인에 연결해 **한국어 2~3문장 요약을 자동 생성**한다.

이것이 묶음 B "양질" 레버의 가장 가시적인 첫 슬라이스(B3-1): 카드·피드·뉴스레터·AI보고서 입력이 한 번에 좋아진다. **키 미등록/한도소진/실패 시 `summary_ko=null` → 기존 UI 폴백 유지**(graceful, 시스템 안 멈춤).

### 설계 결정(Opus)
1. **기존 per-item 흐름에 post-insert update 로 끼운다**(matched 태그 적재와 동일 패턴, try/catch 격리). 크롤 루프 리팩토링 없음.
2. **published 항목만 요약**(pending=승인 큐 보류분은 토큰 절약 위해 skip).
3. **본문 충분한 것만**(짧은 글 요약 무의미·토큰 낭비).
4. **크롤 1회당 요약 예산**(`MAX_SUMMARIES_PER_CRAWL`) — `translationBudget` 패턴 미러. 초과분은 skip(폴백). 토큰/시간 폭주 방지.
5. **입력 최소**: 제목 + 본문 앞 N자(상한)만 전달. 영어 기사는 이미 만든 한국어 번역(body_translated_ko)을 요약.
6. **출력 최소**: 요약문 텍스트만(JSON·머리말 금지). 시스템 프롬프트는 고정(캐싱 유리).

---

## 작업

### 1. 요약 헬퍼 `src/lib/crawler/summarize.ts`
- `summarizeKo(titleKo: string, bodyKo: string): Promise<string | null>`
  - 시스템 프롬프트(고정, 한국어): "당신은 B2B 텔레콤/엔터프라이즈 시장 정보 요약가다. 입력 기사를 한국어 2~3문장으로 핵심만 요약하라. 사실만, 추측·과장 금지. 요약문만 출력(머리말·따옴표·목록 금지)." 톤은 차분한 비즈니스(AGENTS #1, 도메인 톤).
  - user: `제목: {titleKo}\n본문: {bodyKo 앞 SUMMARY_INPUT_MAXCHARS(예 2000)자}`.
  - `const out = await llmComplete('summarize', system, user)` → trim. 빈 문자열/null → null 반환.
  - 과도하게 길면(예 > 600자) 잘라내거나 그대로 둠(상한 가벼운 방어). throw 금지.
- 'server-only'(llmComplete 가 server-only) — 크롤은 서버 경로라 안전.

### 2. `processCrawlItem` 통합
- 상수: `MAX_SUMMARIES_PER_CRAWL`(예 60), `SUMMARY_MIN_BODY_LEN`(예 200), `SUMMARY_INPUT_MAXCHARS`(예 2000) — 파일 상단 기존 상수 옆.
- 예산: `summarizeBudget: { remaining: number }` 를 `translationBudget` 처럼 runCrawl 에서 1개 생성해 crawlOne/crawlKeywordSearch → processCrawlItem 으로 전달(translationBudget 와 동일 시그니처 확장).
- **신규 insert 성공 직후**(matched 태그 update 자리 부근), 아래 조건 모두 만족 시에만 요약:
  - `contentStatus === 'published'`
  - 요약 대상 본문 = `translatedContent?.body ?? item.body ?? ''`; 길이 ≥ `SUMMARY_MIN_BODY_LEN`
  - `summarizeBudget.remaining > 0`
  - 요약 제목 = `row.title`(번역됐으면 한국어 제목)
- 호출 후 `summarizeBudget.remaining--`(시도 시 차감), 결과 있으면 post-insert update:
  ```
  try {
    const summary = await summarizeKo(row.title, bodyKo)
    if (summary) {
      const { error } = await admin.from('contents').update({ summary_ko: summary }).eq('id', newId)
      if (error) console.error('[크롤러] 요약 적재 실패:', error.message)
    }
  } catch (e) { console.error('[크롤러] 요약 생성 실패:', e) }
  ```
  - **insert·태깅을 깨지 않게 격리**(요약 실패해도 기사 적재는 유지).
- pending/짧은 본문/예산 소진 → summary_ko 미설정(null) → UI 폴백.

### 3. (확인) UI 폴백 호환
- 기존 카드/피드/상세가 `summary_ko` 있으면 우선 표시, 없으면 본문 폴백인지 확인(이미 그렇게 동작 — 무변경). summary_ko 채워지면 자동 반영.

## 회귀 / 주의
- DB 무변경(summary_ko 기존 컬럼). 게이트·중복제거·번역·matched 태그·집계·counts 전부 불변.
- **키 미등록 환경(현재)**: `llmComplete` → null → summary_ko 안 채워짐 → 빌드·크롤 정상. tsc/build/lint 통과해야 함.
- 토큰/시간: 예산 상한 + published + 본문상한으로 1회 호출수·입력 제한. 한도는 llm_settings/llm_usage 로 llmComplete 내부에서 추가 차단(이중 안전).
- 요약은 **신규 적재분만**(processCrawlItem 은 insert 신규만 처리) → 재수집 시 중복 요약 없음. (기존 published 백필은 범위 밖, 후속 선택.)
- UI 텍스트·주석·시스템 프롬프트 한국어(#1). 색상/hex 신규 없음(백엔드).

## 완료 조건
- [ ] `summarize.ts`: `summarizeKo` (llmComplete('summarize') + 고정 한국어 시스템 프롬프트 + 입력 상한 + null graceful)
- [ ] `processCrawlItem`: published·본문충분·예산 조건부 post-insert update(summary_ko), 격리(try/catch)
- [ ] `summarizeBudget` runCrawl→crawlOne/crawlKeywordSearch→processCrawlItem 전달(translationBudget 미러)
- [ ] `npx tsc --noEmit` · `npm run build` · `npm run lint`(신규 0) 통과
- [ ] 육안(키 등록 후): "지금 수집" → 신규 뉴스 카드에 LLM 한국어 요약 표시 / 키 없을 땐 폴백 유지·에러 없음

## 보고 양식
```
## 완료 보고 — 지시서 62 B3-1 LLM 한국어 요약
- 변경 파일: <목록>
- summarize.ts(llmComplete summarize)·processCrawlItem 통합(published·예산·격리)·summarizeBudget 전달
- 키 미등록 graceful(null→폴백) 확인 · DB 무변경
- 검증: tsc · build · lint(신규 0)
- 미해결: <키 등록 후 육안 등>
```

---

### 메모(후속)
- 선결: **LLM 키 Vercel 등록**(David/수희) → 요약 실제 작동·검증. 등록 전엔 코드만 머지(폴백 동작).
- 다음 슬라이스: 63(LLM 관련도 재판정 + 보조 태그, 배치=크롤 루프 2단계 리팩토링), 64(시그널 content_signals, 신규 SQL 필요).
- (선택) 기존 published 뉴스 summary_ko 백필 배치 — 별도 admin 액션/스크립트.
