# 지시서 461-A — LLM `'search'` task 신설 + 어드민 on/off (461-B RAG 부활의 전제)

**SQL 0 · env 0 · 의존성 0.** 브랜치 `agent/461a-search-task`.

## 배경
검색 AI 답변(RAG)은 2026-07-07 `2054048`에서 제거됐고 사유는 품질이 아니라 **한도**였다(원문: *"Cerebras 사용량 초과 완화 목적"*).
재발 원인은 옛 `rag-answer.ts`가 **`llmComplete('report', …)`** 를 써서 **리포트와 예산을 공유**한 것이다. 검색은 호출 빈도가 리포트와 비교가 안 된다.
⇒ 부활하려면 **task 분리 + 끌 수 있는 스위치 + 폴백 차단**이 먼저다. 이 지시서는 그 인프라만 만든다(**사용자 화면 변화 0**).

## ⚠️ 핵심 — 폴백 풀이 스위치를 무력화한다
`llmCompleteDetailed`는 라우팅 실패·비활성·한도초과 시 **고정 폴백 풀(`LLM_PROVIDERS`) 전체를 순회**한다.
따라서 `'search'` 라우팅을 꺼도 **폴백 풀이 대신 호출**해버린다 → 스위치가 듣지 않고, 다른 provider 예산을 검색이 잠식한다. **07-07 사고의 재발 경로가 정확히 여기다.**

**해결**: `llmCompleteDetailed`에 폴백 금지 옵션 추가.
```
llmCompleteDetailed(task, system, user, opts?: { allowFallbackPool?: boolean })
// 기본 true — 기존 호출부 전부 무변경(회귀 0)
// 'search' 는 false 로 호출 → 라우팅이 없거나 전부 실패하면 즉시 { text: null, errorReason } 반환
```
`llmComplete` 얇은 래퍼도 같은 옵션을 통과시킨다. **기본값을 바꾸지 말 것**(다른 task가 조용히 폴백을 잃는다).

## 변경

### 1. task 타입 확장
`src/lib/llm/types.ts` `LlmTask`에 **`'search'`** 추가. 기존 7종은 그대로.

### 2. 라우팅 행 upsert — SQL 없이 어드민에서
`llm_task_routing`은 `task_type`이 **자유 text(CHECK 없음)**, 제약은 `UNIQUE(task_type, priority)`뿐이다. 조회는 이미 `.eq('is_active', true).order('priority')`를 적용하므로 **`is_active` 토글이 곧 실질 on/off**다.
→ **DDL·시드 SQL 불필요.** 어드민에서 `task_type='search', priority=1` 행을 **upsert**(없으면 생성)한다.

### 3. 어드민 '검색 AI 답변' 카드
`LlmManager`(`/admin/settings?tab=llm`)에 전용 카드 추가:
- **on/off 토글** → `task_type='search'` 행의 `is_active`
- **provider·model 선택** → 같은 행의 `provider`·`model_id` (기존 `models` 목록 재사용)
- **선택한 provider의 현재 사용률 표시** — 457/457-B의 `effectiveTokenLimit` 데이터를 **그대로 재사용**(계산 재구현 금지). 어느 provider에 여유가 있는지 보고 고르는 화면이어야 한다.
- 라우팅 행이 없으면 "미설정(검색 AI 답변 꺼짐)" 표시.

⚠️ **자동 배정 금지.** 사용률이 낮은 provider를 코드가 골라주지 말 것 — 낮은 이유가 "여유"가 아니라 **품질·속도가 나빠 폴백 순서상 안 뽑히는 것**일 수 있다. 사람이 고른다.

### 4. 운영 권고를 UI 문구로
카드에 한 줄: *"다른 작업이 쓰지 않는 provider를 지정하세요. 검색은 호출이 잦아 예산을 함께 쓰면 다른 작업이 막힙니다."*
(`llm_settings` 한도는 provider 단위라 예산이 공유된다 — 이게 07-07 사고의 구조적 원인이다.)

## 완료조건
- `'search'` 라우팅이 없거나 꺼져 있으면 **LLM 호출 0**(폴백 풀로도 새지 않음)
- 기존 7종 task **동작·폴백 거동 변경 0**(`allowFallbackPool` 기본 true)
- 어드민에서 on/off·provider·model 지정이 SQL 없이 저장됨(upsert)
- 사용률 표기가 457-B와 동일 값(재계산 0) · 자동 배정 코드 0
- 사용자 화면 변화 0 · tsc/lint/build

## 재현검증
`allowFallbackPool` 기본값이 true이고 기존 호출부 diff 0 · `'search'` + 폴백금지 경로가 `LLM_PROVIDERS` 순회에 도달하지 않음 · upsert가 `UNIQUE(task_type, priority)` 충돌을 정상 처리 · 사용률 계산 중복 정의 0.

## 후속
**461-B(RAG 복원)** 가 이 인프라의 소비자다. 삭제 자산은 `git show 2054048^:src/lib/search/rag-retrieve.ts`(171줄) · `rag-answer.ts`(83줄) · `/api/search/rag`(60줄)에서 복원한다. 복원 시 `llmComplete('search', …, { allowFallbackPool: false })` 로 호출할 것 — **`'report'` 로 되돌아가면 07-07이 그대로 재현된다.**
