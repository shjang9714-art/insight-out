# 지시서 129 — 기사 풀본문 채우기 (일괄 자동반복 · 기간 필터 · 유지 cron)

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Claude Code) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전 확인: `src/app/api/admin/body-backfill/route.ts` · `src/components/admin/AdminContentManager.tsx`(handleEnrich/버튼) · `src/lib/contents/enrich-body.ts`(enrichOneBody, 변경 없음) · `src/app/api/cron/crawl/route.ts`(인증 패턴 미러) · `src/lib/crawler/orchestrator.ts`(MAX_ENRICH_PER_CRAWL) · `vercel.json`.
> **코드만(SQL 핸드오프 없음).** `npm install` 먼저.

---

## 배경

128(본문 백필)로 `/api/admin/body-backfill`(회당 1~30건) + "본문 보강" 버튼을 만들었으나, 적체가 약 2,290건이라 수동으로 15건씩 ~150번 클릭해야 함 = 비현실적. 추출은 건당 ~6초(서버리스 5분 캡 → 회당 최대 ~30건). 성공률 ~60%(구글뉴스 리다이렉트·봇차단은 구조적 실패 → `body_fetched_at` 마킹만, 풀에서 제거되므로 재시도 안 됨).

**역할 분담(설계 결정):**
- **버튼 = 주력(일회성 대량 소진).** 클릭 1번 → 클라이언트가 30건씩 remaining 0까지 자동 반복. 탭 열어두면 backlog가 한 번에 빠짐.
- **cron = 유지용(야간 무인).** 매일 잔여·신규를 시간상자 안에서 긁어 0 근처 유지.
- **크롤 enrich 한도 상향 = 재적체 방지.**

**v1 비포함(후속 옵션):** "가치순(content_entities 링크 우선)" 정렬은 PostgREST distinct-join/RPC가 필요해 SQL 핸드오프가 붙음 → v1은 **최신순(`collected_at desc`) 유지**(최근 기사가 곧 현행 논조·이슈 소비 대상이라 충분한 프록시). 가치순은 추후 `contents_backfill_queue` 뷰로 분리.

---

## A. 라우트 확장 — `src/app/api/admin/body-backfill/route.ts`

기존 동작 유지 + **기간 필터** 추가. (limit clamp 1~30, maxDuration=300, 어드민 게이트 그대로.)

1. 쿼리 파라미터 `from`, `to` 파싱(둘 다 선택, ISO date `YYYY-MM-DD` 가정).
   ```ts
   const from = request.nextUrl.searchParams.get('from') // nullable
   const to   = request.nextUrl.searchParams.get('to')   // nullable
   ```
2. 대상 조회 쿼리(targets)와 remaining 카운트 쿼리 **둘 다**에 동일 필터를 조건부로 적용:
   ```ts
   let q = admin.from('contents')
     .select('id, original_url, body_original')
     .is('body_fetched_at', null)
     .not('original_url', 'is', null)
   if (from) q = q.gte('collected_at', from)
   if (to)   q = q.lte('collected_at', to + 'T23:59:59.999Z') // to 당일 포함
   q = q.order('collected_at', { ascending: false }).limit(limit)
   ```
   - remaining 카운트(현재 코드의 2곳: rows.length===0 분기 + 마지막 집계)에도 **같은 from/to 조건**을 적용하는 헬퍼로 중복 제거 권장(`buildPendingQuery(admin, from, to)` 식). 필터 없으면 전체 = 기존 동작과 동일.
3. 응답 형태 불변: `{ processed, improved, skipped, remaining }`.
4. (검증) from/to 미지정 호출은 기존과 100% 동일해야 함(회귀 0).

## B. 버튼 UI — `src/components/admin/AdminContentManager.tsx`

### B-1. 라벨 변경
- 버튼 텍스트 `'본문 보강'` → **`'기사 풀본문 채우기'`**. 로딩 중 라벨 `'보강 중…'` → `'채우는 중…'`.

### B-2. 기간 프리셋
- 버튼 옆 작은 `select`(또는 세그먼트): **전체 / 최근 7일 / 최근 30일**. (직접 지정 달력은 v2.)
- 상태 `const [backfillRange, setBackfillRange] = useState<'all'|'7d'|'30d'>('30d')` (기본 최근 30일).
- 프리셋 → `from` 계산: 7d/30d는 `new Date(Date.now()-N*864e5).toISOString().slice(0,10)`, all은 미전달. `to`는 미전달(오늘까지).

### B-3. 자동 반복(일괄) + 진행률 + 중단
`handleEnrich`를 **반복 드레인**으로 교체:
- 상태 추가: `isEnriching`(기존 재사용), `enrichResult`(기존), `const stopRef = useRef(false)`.
- 동작:
  ```
  stopRef.current = false
  누적 acc = { processed:0, improved:0, skipped:0 }
  loop:
    const url = `/api/admin/body-backfill?limit=30` + (from? `&from=${from}`:'')
    res = await fetch(url, { method:'POST' })   // 실패 시 throw → 루프 종료
    { processed, improved, skipped, remaining } = await res.json()
    acc 누적
    setEnrichResult(`채우는 중… 누적 처리 ${acc.processed} · 개선 ${acc.improved} · 실패 ${acc.skipped} · 남은 ${remaining.toLocaleString()}`)
    if (remaining === 0) → 완료 메시지, break
    if (processed === 0) → break (안전: 더 이상 진행 불가)
    if (stopRef.current) → 중단 메시지(`중단됨 · 누적 처리 ${acc.processed} · 남은 ${remaining}`), break
    (선택) await sleep(300)  // 매너 딜레이
  finally: setIsEnriching(false)
  ```
- 완료 메시지: `` `완료 · 처리 ${acc.processed} · 개선 ${acc.improved} · 실패 ${acc.skipped}` ``.
- **중단 버튼**: `isEnriching`일 때 "채우기" 버튼이 **"중단"**으로 바뀌어 `onClick={() => { stopRef.current = true }}`. (현재 진행 중 배치는 끝나고 멈춤.)
- 무한루프 불가 보장: 마킹/개선 모두 `body_fetched_at`을 채워 풀에서 제거 → remaining은 매 배치 `processed`만큼 감소. `processed===0` 가드까지 이중 안전.

### B-4. 안내 문구(작은 회색 텍스트)
버튼 근처에 1줄: `"추출 성공률 ~60%(구글뉴스·봇차단 사이트는 구조적 실패). 탭을 열어둔 채 진행됩니다."` (AdminEmptyState/기존 muted 스타일 재사용, 하드코딩 색 금지.)

## C. 유지 cron — `src/app/api/cron/body-backfill/route.ts` (신규)

`cron/crawl` 인증·런타임 패턴 미러.
```ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300
```
- `GET`: `Authorization: Bearer ${process.env.CRON_SECRET}` 검증(crawl과 동일), 불일치 401.
- 시간상자 드레인: `const deadline = Date.now() + 270_000`(270초 안전마진). while(now < deadline): 30건 배치 조회(`body_fetched_at IS NULL & original_url NOT NULL`, collected_at desc) → 없으면 break, 각 행 `enrichOneBody` → 누적. 배치 끝마다 시간 체크.
- 응답: `{ ok:true, processed, improved, skipped, remaining }`.
- **공유 로직 재사용**: A에서 만든 pending 쿼리 헬퍼/`enrichOneBody`를 그대로 사용(인라인 복제 금지). 라우트 핸들러 본체 로직을 `src/lib/contents/enrich-body.ts`에 `drainBackfill(admin, { limit, from?, to?, deadline? })` 헬퍼로 추출해 어드민 라우트(A)·cron(C) 양쪽이 호출하도록 리팩터하면 중복 0(권장).
- `vercel.json` crons에 추가:
  ```json
  { "path": "/api/cron/body-backfill", "schedule": "0 19 * * *" }
  ```
  (UTC 19:00 = KST 04:00, 크롤 05:00 직전. 잔여를 미리 정리.)

## D. 재적체 방지 — `src/lib/crawler/orchestrator.ts`

- `MAX_ENRICH_PER_CRAWL = 15` → **`30`**. (크롤 cron maxDuration=60 한도 내라 과도 상향 금지; 30이면 신규 일일 유입 대부분 즉시 풀본문화. 초과분은 C cron이 야간에 흡수.)

---

## 검증 (구현 에이전트)
- `npx tsc --noEmit` 0 / `npx eslint src/components/admin/AdminContentManager.tsx src/app/api/admin/body-backfill/route.ts src/app/api/cron/body-backfill/route.ts src/lib/contents/enrich-body.ts` 0.
- 하드코딩 hex/색 grep 0(진행률·안내문구는 기존 토큰/뮤티드 클래스만).
- 회귀: from/to 없는 `/api/admin/body-backfill?limit=N`은 기존과 동일 응답.
- 커밋·푸시. (배포 후 수동) `/admin/contents` "기사 풀본문 채우기"(최근 30일) → 진행률 갱신·remaining 0 도달·중단 동작 확인. cron은 `CRON_SECRET`으로만 도달.

## 운영 순서
1. 구현·커밋·푸시 → 배포(`/api/version` 캐시버스트 확인).
2. David: "기사 풀본문 채우기" 최근 30일 1회 드레인(즉시 가치 구간 확보).
3. 이후 전체 backlog는 탭 열고 '전체'로 한 번 돌리거나, C cron이 며칠에 걸쳐 자동 소진.
