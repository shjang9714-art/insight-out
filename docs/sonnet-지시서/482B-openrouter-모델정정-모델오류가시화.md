# 지시서 482-B — openrouter 기본모델 정정 + 라우팅 모델 오류 가시화

> 작성: 플래너(Opus) · 2026-07-31 · 기준 `origin/main = 6c9e657`
> 브랜치: `agent/482b-model-health`
> 규모: 소~중 · **SQL 1건**(David 직접, 코드 배포 전 적용) · 환경변수 0 · 의존성 0

---

## 0. 배경

482에서 `LlmModelUnavailableError`로 404를 즉시 이탈시켰지만 **죽은 모델 자체는 그대로 남았다.**

- `src/lib/llm/providers/openrouter.ts:7` `defaultModel: 'meta-llama/llama-3.3-70b-instruct:free'` → **404(유료 전환)**
- 이 값은 **고정 폴백 풀이 openrouter를 부를 때 쓰인다**(모델 미전달 → `resolvedModel = env || defaultModel`). 검색뿐 아니라 **안전망 마지막 provider가 전 task에서 죽어 있다.**
- `llm_task_routing`의 `classify` 4·5순위 등 다른 행도 같은 슬러그일 수 있다.

**그리고 이건 3회차다.** `supabase/2026-07-09-key-insight-라우팅-모델교체.sql`이 1회차(`google/gemini-2.0-flash-exp:free` 404)를 기록하고 있고, 그때 갈아탄 슬러그가 이번에 죽었다. **무료 슬러그를 코드에 박아두는 한 반복된다.** 이번엔 슬러그 교체만 하지 말고 **감지 장치를 같이 넣는다.**

---

## A. openrouter 기본모델 교체

`src/lib/llm/providers/openrouter.ts`
```
defaultModel: 'meta-llama/llama-3.3-70b-instruct:free'
  → defaultModel: 'openrouter/free'
```

**`openrouter/free`는 OpenRouter가 제공하는 무료 모델 자동 라우터**다(현재 사용 가능한 무료 모델 중에서 요청 요건에 맞는 것을 골라 준다, 200K 컨텍스트). 개별 슬러그가 은퇴해도 **404로 죽지 않는다** — 이 자리(고정 폴백 풀 최후 수단)에 정확히 맞는 성질이다.

⚠️ **대신 어떤 모델이 답할지 예측할 수 없다.** 따라서:
- **구조화 출력(JSON)이 필요한 task의 명시 라우팅 행에는 openrouter를 쓰지 않는다.** 검색(`search`)·리포트(`report`)가 여기 해당한다.
- 그 자리엔 cerebras·mistral·groq처럼 모델이 고정된 provider를 쓴다.

주석으로 위 성질과 "여기에 개별 `:free` 슬러그를 다시 박지 말 것"을 남긴다.

---

## B. 라우팅 모델 오류 가시화 (재발 방지 본체)

### B-0. 선행 SQL — `docs/sql-handoff/482B-llm_task_routing-모델오류-컬럼.sql`
`llm_task_routing`에 `last_error text` · `last_error_at timestamptz` 추가. **David가 코드 배포 전에 적용한다.**

### B-1. `src/lib/llm/index.ts` — 실패/성공을 행에 기록
라우팅 순회에서,
- **permanent(404/400)** 로 실패하면 해당 행에 `last_error = '{provider}: 모델 사용 불가(404) — {model_id}'`, `last_error_at = now()` 를 기록한다.
- **성공하면** 그 행의 `last_error`·`last_error_at` 을 `null` 로 초기화한다.
- 기록 실패는 **삼킨다**(`console.error`만). 계측 때문에 LLM 호출이 죽으면 안 된다.
- 고정 폴백 풀에는 대응 행이 없으므로 기록하지 않는다.

⚠️ **행을 자동으로 `is_active=false` 로 바꾸지 마라.** 일시적 오탐 한 번으로 라우팅이 꺼지면 원인 추적이 더 어려워진다. 기록·표시까지만 한다.

### B-2. `src/lib/ops/detect-issues.ts` — 운영이슈 신호 추가
`llm_task_routing`에서 **`last_error_at`이 최근 24시간 이내인 활성 행**을 조회해 신호를 만든다.

```
fingerprint: `llm:model_unavailable:${task_type}:${priority}`
category:    'usage'
severity:    'warning'
title:       'LLM 라우팅 모델 사용 불가'
suspected_cause: `${provider}/${model_id} 가 404 를 반환 — 모델이 은퇴했거나 유료로 전환됨`
recommended_action: '어드민 > 시스템 설정 > AI 모델에서 해당 순위의 모델을 교체하세요.'
impact:      `${task_type} 작업이 해당 순위를 건너뜀`
count:       1
```

⚠️ **반드시 `detectOpsIssues` 안에 넣어야 한다.** 이 함수는 **신호 목록에 없는 open 이슈를 자동 resolved 처리**하므로(같은 파일 하단), 다른 곳에서 `ops_issues`에 직접 써 넣으면 다음 크론 실행 때 조용히 닫힌다. 모델을 고치면 `last_error`가 null이 되어 신호가 사라지고 자동 resolved — 이게 의도된 동작이다.

### B-3. `src/components/admin/LlmManager.tsx` — 표에 오류 표시
- 라우팅 표(`ROUTING_COLUMNS`)에 `last_error` 가 있는 행을 **경고 표식**으로 구분한다(모델 셀 옆 배지 또는 행 강조 + 툴팁에 `last_error`).
- 검색 3슬롯 카드에도 해당 순위에 `last_error`가 있으면 한 줄로 노출한다.
- `/api/admin/llm` GET이 `last_error`·`last_error_at`을 함께 반환하도록 select에 추가.

---

## C. 482 잔여 엣지 정리

`src/components/admin/LlmManager.tsx` `saveSearchSlot`
```
const isActive = priority1Routing?.is_active ?? false
```
1순위 행이 없을 때 2·3순위를 저장하면 그 슬롯만 `is_active=false`가 되어 다른 슬롯과 엇갈린다.
→ **`searchRoutingByPriority.some(row => row?.is_active)` 기준**으로 바꾼다(= 렌더에서 쓰는 `isSearchActive`와 같은 판정).

---

## 범위 밖 / 금지

- ❌ **`OPENROUTER_MODEL` env 변경** — 전 task 유료화. 금지선.
- ❌ **유료 슬러그(`meta-llama/llama-3.3-70b-instruct`) 지정** — 유료 도입은 460 선행 후 재검토.
- ❌ 라우팅 행 **자동 비활성화**.
- ❌ `llm_usage` 스키마 변경 · RPM/일일 요청 수 계측 신설(별도 건).
- ❌ 검색 프롬프트·근거 가드 변경.

---

## 검증

1. 죽은 모델(`meta-llama/llama-3.3-70b-instruct:free`)로 라우팅 행을 하나 만들어 호출 → 그 행의 `last_error`·`last_error_at`이 채워진다.
2. 정상 모델로 바꿔 호출 성공 → 같은 행의 `last_error`가 **null 로 초기화**된다.
3. 1번 상태에서 `detectOpsIssues` 실행 → `ops_issues`에 `llm:model_unavailable:*` 이 open 으로 생긴다. 2번 후 재실행 → **자동 resolved**.
4. 어드민 AI 모델 화면에서 1번 행이 경고 표식으로 보인다.
5. C: 1순위를 비운 상태에서 2순위를 저장해도 다른 슬롯과 활성 상태가 엇갈리지 않는다.
6. `npm run lint` · `npx tsc --noEmit` 무경고.

---

## 위임 블록 (Sonnet)

1. 브랜치 `agent/482b-model-health` 를 `origin/main`(6c9e657)에서 생성.
2. **SQL 적용 확인 후** A → B → C 순으로 구현. 컬럼이 없으면 중단·보고(임의로 SQL 만들지 마라).
3. lint·tsc 통과 확인 후 **커밋+원격 푸시 필수**.
4. 보고: 브랜치 tip · merge-base · origin/main 세 SHA + 검증 1~3의 실제 결과(불가하면 어느 부분이 추적인지 명시) + lint/tsc.
