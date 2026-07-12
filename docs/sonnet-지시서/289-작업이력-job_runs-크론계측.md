# 지시서 289 — 작업 이력(job_runs): 크론 10개 계측 + 실패 가시성

> 작성: Opus(플래너) · 2026-07-11 · 설계: `docs/설계-작업이력-실패가시성.md`
> 근거: David 제안(작업 이력) + 어드민 감사 §7 "AI jobs not first-class".
> 협업 루프: 로컬(커밋X). 위임 → 구현 → 재현검증 → "커밋".
> **SQL 있음**: `docs/sql-handoff/289-job_runs-작업이력.sql` (수희 핸드오프, 멱등).
> 후속: C-2(어드민 수동 잡 13개 계측) · C-3(안 돈 크론 감지 + 보존 정리) — 범위 밖.

---

## 0. 한 줄

**아무도 보고 있지 않은 크론 10개**의 실행을 기록하고, **실패가 눈에 띄게** 만든다.

---

## 1. 현행 진단 (검증된 코드 사실)

### 1.1 크론 10개 — 실행 기록이 전혀 없다
`vercel.json` 기준(전부 `src/app/api/cron/{name}/route.ts`, **10개 모두 `CRON_SECRET` Bearer 검증** 동일 패턴):

| 잡 | 스케줄(UTC) |
|---|---|
| `crawl` | `0 20 * * *` |
| `briefing` | `0 21 * * *` |
| `newsletter` | `0 23 * * *` |
| `body-backfill` | `0 19 * * *` |
| `signals-backfill` | `0 18 * * *` |
| `ai-refresh` | `0 21 * * *` |
| `link-health` | `0 17 * * *` |
| `key-insights` | `0 13 * * *` |
| `daily-insights` | `30 13 * * *` |
| `competitor-weekly` | `0 * * * *` (매시, 284 게이트) |

- **반환 형태가 제각각**이다: `{ ok:true, ...result }`(body-backfill·signals-backfill·competitor-weekly), `{ ok:true, checked, dead }`(link-health), `{ ok:true, skipped:true, reason }`(ai-refresh) 등.
  → 래퍼는 **공통 카운트만 컬럼으로 뽑고, 결과 객체 전체는 `meta` jsonb에 통째로 저장**해야 한다.

### 1.2 기존 기록 수단으로는 부족
- `crawl_logs` — **크롤 전용**(`crawl-now`·`source-status`만 사용).
- `llm_usage`/`translation_usage`/`tts_usage` — **사용량(비용)** 집계이지 실행 이력이 아니다. 실패·소요시간·건수를 못 본다.

### 1.3 왜 지금 이게 중요한가
코드베이스가 **graceful degradation**(실패해도 안 깨짐)으로 짜여 있다. 옳은 설계지만 대가는 **"graceful = 실패가 안 보임"**이다. 실제로 이번 세션에서만:
- 261 SQL 실패를 수희가 에러를 볼 때까지 아무도 몰랐다.
- `ai_report_sources` 이슈 행이 CHECK 위반으로 **계속 조용히 실패**하고 있었다.
- `content_views` 기록 API를 아무도 호출하지 않아 **데이터가 0건**인데 감사 문서엔 "records data"라고 적혀 있었다.

**수동 잡(13개)은 관리자가 눌러서 결과를 즉시 본다. 크론은 아무도 안 본다.** 그래서 크론이 먼저다.

---

## 2. DB / SQL — **있음**

`docs/sql-handoff/289-job_runs-작업이력.sql` (수희 적용):
```
job_runs
  job_key        text   -- 'cron:competitor-weekly'
  trigger        text   -- 'cron' | 'admin'
  mode           text   -- 'fresh'|'retry' 등(nullable)
  started_by     uuid   -- admin 실행자(cron=null)
  status         text   -- running | succeeded | failed | skipped
  started_at / finished_at / duration_ms
  processed / filled / skipped_count / remaining   -- 백필 공통 카운트(nullable)
  error          text
  meta           jsonb  -- 잡별 결과 원본 전체
```
- **`skipped` 상태**는 실패가 아니다(예: 284 크론의 `not_scheduled`). 구분해야 대시보드가 노이즈로 도배되지 않는다.
- `skipped_count` 컬럼명이 `status='skipped'`와 헷갈리지 않게 분리돼 있다. **혼동 주의.**
- RLS 켜짐·정책 없음 → **service_role(서버)만** 접근.

---

## 3. 구현

### 3-1. 공통 래퍼 `src/lib/jobs/run-job.ts` (신규)

```ts
export interface JobContext {
  key: string                    // 'cron:crawl'
  trigger: 'cron' | 'admin'
  mode?: string
  startedBy?: string             // admin 실행자 id
}

export async function runJob<T>(
  admin: SupabaseClient,
  ctx: JobContext,
  fn: () => Promise<T>,
): Promise<T>
```

동작:
1. `job_runs`에 `status='running'` 행 insert → `runId` 확보.
2. `fn()` 실행.
3. 성공 → `status='succeeded'`, `finished_at`, `duration_ms`, **결과에서 공통 카운트 추출**(아래), `meta = 결과 전체`.
4. 예외 → `status='failed'`, `error = 메시지`, 그리고 **예외를 그대로 다시 throw**한다(호출부의 기존 에러 처리 유지).
5. 결과에 `skipped` 표시가 있으면(`result.skipped` 가 truthy — 문자열이든 boolean이든) `status='skipped'`.

**공통 카운트 추출**: 결과 객체에서 `processed` / `filled` / `skipped`(숫자일 때만 → `skipped_count`) / `remaining` 키가 **숫자면** 해당 컬럼에 담는다. 없으면 null. 결과 전체는 항상 `meta`에 저장.
> ⚠️ `skipped`는 잡에 따라 **숫자(건수)**이기도 하고 **문자열(스킵 사유)**이기도 하다(284 크론은 `skipped: 'not_scheduled'`). **숫자일 때만** `skipped_count`에 넣고, 문자열이면 `status='skipped'` 판정에 쓴다.

### 3-2. ⚠️ 계측이 잡을 깨뜨리면 안 된다 (가장 중요)

- `job_runs` insert/update 실패는 **로깅만** 하고 무시한다. `fn()`의 결과·예외를 **그대로** 전파한다.
- **`job_runs` 테이블 미적용(42P01)에서도 모든 잡이 정상 동작**해야 한다.
- 계측 때문에 잡이 느려지거나 실패하면 본말전도다. 가시성 도구가 새로운 장애 원인이 되면 안 된다.
- insert 실패로 `runId`를 못 얻었으면, 이후 update는 조용히 건너뛴다.

### 3-3. 크론 10개 계측
각 `src/app/api/cron/{name}/route.ts`에서 **CRON_SECRET 검증 이후**, 실제 작업을 `runJob`으로 감싼다.

```ts
// 예: competitor-weekly
const result = await runJob(admin, { key: 'cron:competitor-weekly', trigger: 'cron' }, async () => {
  // ... 기존 로직 그대로 ...
  return { ok: true, ...r }
})
return Response.json(result)
```

- **`job_key`는 `cron:{name}`** 형식으로 통일(예: `cron:crawl`, `cron:body-backfill`).
- **기존 로직·반환값·CRON_SECRET 검증은 일절 변경하지 말 것.** 감싸기만 한다.
- 인증 실패(401) 응답은 잡 실행이 아니므로 **기록하지 않는다**(래퍼 밖).

### 3-4. 이력 화면 `/admin/job-runs` (신규)
- **nav 등록 필수**: `src/lib/admin/nav.ts`의 **운영센터** 그룹에 `작업 이력` → `/admin/job-runs` 추가. (등록 안 하면 사이드바에서 도달 불가 — 276에서 겪은 실수.)
- **어드민 role 직접 재확인**(미들웨어 의존 금지).
- 목록: 시작시각 · 잡 · 트리거 · 상태 배지 · 소요(ms) · 처리/설정/스킵/남음 · 오류.
- 필터: **상태(실패만)**, 잡, 기간.
- 테이블 미적용(42P01) 시: 안내 문구 + 빈 목록(graceful).

### 3-5. 운영 대시보드 실패 카드 — **이게 본체다**
`/admin`(운영 대시보드)에 **"최근 실패한 작업"** 카드 추가:
- 최근 24시간 내 `status='failed'`인 `job_runs`를 조회.
- **있으면 눈에 띄게**(잡 이름·시각·오류 요약 + `/admin/job-runs?status=failed` 링크).
- **없으면 조용히**(초록 한 줄 또는 카드 숨김) — 평상시 노이즈가 되면 아무도 안 본다.
- 42P01 시 카드 자체를 숨긴다.

---

## 4. 회귀 가드

- **계측 실패가 잡을 깨뜨리지 않는다**(§3-2). 이 가드가 깨지면 이번 작업은 이득보다 손해다.
- **SQL 289 미적용(42P01)에서도 크론 10개가 전부 정상 동작**해야 한다.
- **CRON_SECRET 검증 로직 제거·완화 금지.** 인증 실패는 기록하지 않는다.
- **기존 크론의 반환 JSON을 바꾸지 말 것** — 다른 곳에서 파싱할 수 있다. 감싸기만 한다.
- `status='skipped'`(안 돌 이유가 있어 안 돎)와 `status='failed'`를 **반드시 구분**한다. 284 크론은 매시 돌면서 대부분 `not_scheduled`로 빠지는데, 이걸 실패로 잡으면 **대시보드가 하루 23건의 가짜 실패로 도배**된다.
- `skipped`(잡 결과의 건수)와 `status='skipped'`를 혼동하지 말 것 → 컬럼명이 `skipped_count`로 분리돼 있다.
- 어드민 화면·API는 **service_role**로 조회(RLS 정책 없음 — 클라이언트 직접 조회는 빈 결과가 정상).

## 5. 검증 (Sonnet)

- `npx tsc --noEmit` 0 / `npx eslint` 0 / `npm run build`.
- **SQL 289 미적용 상태에서 크론을 호출해도 정상 동작**하는지(계측만 조용히 실패). ← 가장 중요
- SQL 적용 후: 크론 호출 → `job_runs`에 행이 남고 `status='succeeded'` + 카운트·`meta` 채워지는지.
- 잡이 예외를 던지면 → `status='failed'` + `error` 기록되고, **예외가 그대로 호출부로 전파**되는지.
- **284 크론(`not_scheduled`)이 `failed`가 아니라 `skipped`로 기록**되는지. ← 안 그러면 대시보드가 가짜 실패로 도배된다.
- `/admin/job-runs`가 사이드바에 뜨고 목록이 보이는지.
- 실패가 없을 때 대시보드 카드가 **조용한지**(노이즈 없음).
- 비관리자 접근 차단.
- 커밋: `feat: 작업 이력(job_runs) + 크론 10개 계측 + 실패 가시성 (지시서 289)`

## 6. 후속(범위 밖)

- **C-2**: 어드민 수동 잡 13개 계측(래퍼 재사용 — 기계적).
- **C-3**: "안 돈 크론" 감지(잡별 기대주기 대비 마지막 성공이 오래됨) + "성과 0 연속" 감지 + 90일 보존 정리.
- 알림(메일·슬랙) — 화면에 보이는 것부터. 알림은 그다음.
- 재시도·취소 버튼 — **의도적으로 뺐다.** 잡 큐를 만드는 순간 복잡도가 폭증하고(중복 실행 방지·락·상태 머신), 값어치의 대부분은 "실패가 보인다"에서 나온다.
