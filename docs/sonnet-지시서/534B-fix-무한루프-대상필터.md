# 지시서 534-B-fix — 재연결 대상 필터 (무한 루프 차단)

> 플래너(Opus) · 2026-08-21 · 브랜치 `agent/534b-entity-relink` (같은 브랜치에 이어서 커밋)
> **DDL·SQL 없음.** 534-B 구현 자체는 정확하다. 종료 조건 하나가 빠졌다.

## 문제 (실측)

`EnrichJobsProvider.tsx:191` 의 러너는 `while (true)` 이고, 빠져나가는 조건은
`result.remaining === 0` 또는 `result.processed === 0` 둘뿐이다.

그런데 `drainEntityRelink` 의 대상 정의는 **"matched_keywords 가 있고 링크가 없는 콘텐츠"** 다.
`matched_keywords` 가 있어도 그 키워드가 엔티티 이름·별칭 중 어느 것과도 안 맞으면
링크가 생기지 않으므로 **그 행은 영원히 대상 집합에 남는다.** 즉 `remaining` 이 0이 되지 않는다.

프로덕션 실측 (2026-08-21):

```
대상 전체(링크 없음 + matched_keywords 있음)   4,013건
  이름·별칭 120개 중 하나라도 겹침 → 처리 가능   1,929건
  하나도 안 겹침 → 영원히 잔류                 2,084건

from=2026-08-17 로 좁혀도:
  대상 1,999건 = 처리 가능 1,924 + 영원히 잔류 75
  collected_at 오름차순 첫 200건 중 이미 22건이 잔류행
```

정렬은 `collected_at asc` 로 고정이고 잔류행은 배치에서 빠지지 않으므로,
매칭 가능한 행이 소진되면 **매 반복이 같은 200건을 다시 가져온다.**
`processed = 200`(≠0), `remaining = 75`(≠0) → **러너가 영원히 POST 를 반복한다.**
매 반복마다 `runJob` 이 `job_runs` 에 행을 쓰므로 로그도 무한히 늘어난다.

지시서 534-B 가 "`remaining` 이 0이 될 때까지 반복 실행한다" 라고 쓴 것도
이 구현으로는 성립하지 않는다. 내 지시서의 누락이다.

## 고칠 것

### 1) `src/lib/entities/alias-map.ts` — 원본 대소문자 이름 목록도 내보낸다

지금 맵은 키를 소문자로 낮춘다. 대상 필터에는 **원본 표기 그대로**가 필요하다.
기존 호출부(`orchestrator.ts`, `contents/[id]/extract/route.ts`)는 건드리지 말 것.

```ts
export interface EntityAliasIndex {
  map: Map<string, string>   // lower(name) → entity_id
  names: string[]            // 원본 표기 그대로 (canonical_name + alias)
}

export async function loadEntityAliasIndex(admin: SupabaseClient): Promise<EntityAliasIndex>
```

`loadEntityAliasMap` 은 `(await loadEntityAliasIndex(admin)).map` 을 돌려주는
얇은 래퍼로 바꾼다. 조회 쿼리는 지금 그대로 한 번만 돈다(추가 왕복 금지).
실패 시 기존과 동일하게 `{ map: new Map(), names: [] }` 로 조용히 skip 한다.

### 2) `src/lib/entities/relink-backfill.ts` — 대상 정의에 겹침 조건을 넣는다

`drainEntityRelink` 와 `countRemaining` **양쪽 모두**에 같은 필터를 건다:

```ts
.overlaps('matched_keywords', names)
```

- `countRemaining` 이 `names` 를 인자로 받도록 시그니처를 바꾼다.
  **두 쿼리의 필터가 갈라지면 이 버그가 그대로 재발한다** — 필터 구성은 한 헬퍼로 묶을 것.
- 이제 대상 = "이번 실행에서 실제로 링크가 생길 행" 이므로 `remaining` 이 0으로 수렴한다.
- 실측으로 확인한 것: 엔티티 이름·별칭 120개에 쉼표·중괄호·따옴표·앞뒤 공백이 **하나도 없고**,
  대소문자 구분 겹침(1,924건)과 무시 겹침(1,924건)이 **정확히 같다.**
  따라서 원본 표기 그대로 `overlaps` 를 걸어도 손실이 없다.
- `names` 가 비면(맵이 빈 경우) 지금처럼 즉시 중단하는 분기가 먼저 걸리므로
  `overlaps` 에 빈 배열이 들어갈 일은 없다. 그래도 방어적으로 확인할 것.

### 3) 건너뛴 사유를 나눠서 보고한다

지금은 `skipped` 하나에 두 사유가 섞여 있다. `extra` 로 분리한다:

```ts
extra: { alreadyLinked, noEntityMatch }
```

`noEntityMatch` 는 2)의 필터가 제대로 걸렸다면 **0이어야 한다.**
0이 아니면 필터와 매핑 로직이 어긋났다는 신호다 — 검증 지표로 쓴다.

## 하지 않을 것

- 크론 등록 (여전히 수동 실행 전용)
- `contents` UPDATE
- `EnrichJobsProvider` 의 `while (true)` 구조 변경 — 다른 잡 8종이 같은 러너를 쓴다.
  이 잡의 대상 정의를 고치는 게 맞다
- `entities` / `entity_aliases` 행 추가로 잔류 2,084건을 없애려는 시도 (별건)

## 검증 — 이번엔 반드시 **실제로 실행**한다

534-B 는 정적 검사만 통과하고 런타임 검증이 0이었다. 그래서 이 버그가 남았다.
아래 PostgREST 관용구 두 개는 이 코드베이스에서 처음 쓰는 것이라 **말로 확인이 안 된다.**

- `select('id, content_entities()')` + `.is('content_entities', null)` (NOT EXISTS)
- `.overlaps('matched_keywords', names)` (배열 겹침, 값 120개)

1. `npx tsc --noEmit` / `npx eslint`(경고 0건) / `npm run build`
2. **`limit=5&from=2026-08-17` 로 실제 POST 한다.** 200 이 떠야 하고,
   400/PGRST 오류가 나면 관용구가 안 먹는 것이니 즉시 보고할 것
3. 같은 호출을 **두 번 연속** 실행해 `remaining` 이 5씩 줄어드는지 확인
   — 줄지 않으면 대상 필터와 upsert 가 어긋난 것이다
4. `extra.noEntityMatch === 0` 인지 확인
5. `remaining` 초기값이 **1,924 근처**로 나오는지 확인(1,999 가 나오면 겹침 필터가 안 걸린 것)
6. 값 120개가 URL 길이 제한에 걸리지 않는지 — 2번이 200 이면 통과한 것

## 보고

`limit=5` 두 번 실행의 **응답 JSON 원문 두 개**를 그대로 붙일 것. 요약하지 말 것.
