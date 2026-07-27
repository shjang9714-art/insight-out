# Phase 1-C — Supabase 보강 워커 상세 스펙 (2026-07-24)

> 목표: 게시-게이트 flip(B) 후 쌓이는 `pending` 보강 큐를 **자주 드레인**해 게시로 빠르게 승격. Vercel Hobby 하루1회 크론 제약을 우회.
> 담당: **[수희]** Supabase pg_cron·pg_net·시크릿 · **[Sonnet]** enrich 엔드포인트 확인/소폭 조정(C1) · **[Opus]** 이 스펙.

---

## 0. 핵심 통찰 — 이식 불필요
**Hobby 크론 제한은 `vercel.json` 크론에만 적용된다. 일반 API 엔드포인트를 외부에서 자주 호출하는 건 제한이 없다.**

→ enrich 로직을 Supabase Edge Function(Deno)으로 **이식하지 않는다.** 대신 **Supabase pg_cron 이 기존 Vercel enrich 엔드포인트를 N분마다 호출**한다. 스케줄러만 Supabase 로 옮기고, 워커(추출·품질·관련도 = B의 로직)는 Vercel 에 그대로 둔다. **코드 중복 0.**

```
Supabase pg_cron (10분마다)  ──net.http_post + Bearer CRON_SECRET──▶  Vercel /api/cron/body-backfill
                                                                       (기존 drainBackfill: 추출·품질·게시)
```

---

## 1. 구성

### C1. Vercel enrich 엔드포인트 [Sonnet — 확인/소폭 조정]
- **기존 `/api/cron/body-backfill`(route.ts)를 그대로 재사용**한다. 이미 `drainBackfill(admin, { limit, deadline })` 로 `body_fetched_at IS NULL` 큐를 배치 드레인하고, `CRON_SECRET` Bearer 인증이 있다.
- 확인·조정할 것:
  1. **자주 호출해도 안전한가**(멱등): enrich 가 `body_fetched_at` 마킹으로 재처리를 막으므로 안전. 확인만.
  2. **1회 호출 바운드**: `limit`·`deadline` 로 각 호출이 짧게 끝나는지(예: limit 30, deadline ~120s). 자주 부를 거라 **1회를 짧게**(예: limit 20~30, deadline 90~120s)로 조정 권장 → 함수 시간·중복 최소화.
  3. **동시 실행 가드**: pg_cron 간격(10분) > 1회 소요(≤2분)면 겹치지 않음. 겹쳐도 `body_fetched_at` 마킹으로 무해하나, 원하면 간단한 advisory lock.
  4. **B의 관련도 게이트가 이 경로에도 반영**되는지(425 §2.2) — body 계열 pending 게시 전 matched_groups/exempt 확인. B와 같은 enrich 로직이면 자동 반영.
- ⚠️ **`vercel.json` 크론 목록은 손대지 않는다**(그건 Hobby 하루1회). 이 엔드포인트는 pg_cron 이 외부 호출.
  - (선택) 기존 `body-backfill` 일 1회 vercel 크론은 **유지해도 되고 제거해도 됨**(pg_cron 이 대체). 제거 시 Hobby 크론 슬롯 1개 확보 — 수희·Sonnet 판단.

### C2. Supabase pg_cron + pg_net [수희]
- 확장 활성화: `pg_cron`, `pg_net`.
- `CRON_SECRET` 을 **Supabase Vault**(또는 안전한 설정)에 저장 — pg_cron 잡이 Bearer 로 사용.
- 잡 등록(예: 10분마다):
```sql
-- 확장
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 10분마다 Vercel enrich 드레인 호출
select cron.schedule(
  'enrich-drain',
  '*/10 * * * *',
  $$
  select net.http_post(
    url    := 'https://insight-out-app.vercel.app/api/cron/body-backfill',
    headers:= jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET'),
      'Content-Type', 'application/json'
    ),
    body   := '{}'::jsonb
  );
  $$
);
```
- 간격은 큐 적체·함수 사용량 보며 조정(5~15분). 야간 크롤 직후 적체가 크면 한동안 5분.

---

## 2. 착지 순서·의존
- **A(스키마)** 먼저 → **B(flip)** 는 A 후 반영.
- **C 는 B 와 무관하게 먼저 세팅 가능**(기존 body-backfill 을 자주 부를 뿐이라 B 전에도 무해). B 반영 후 pending 이 늘면 C 가 그걸 빠르게 게시로 승격.
- 이상적: **A → (B, C 동시 반영)**. C의 pg_cron 은 미리 켜둬도 됨.

## 3. 검증
- pg_cron 잡 등록 확인: `select * from cron.job;`
- 실행 로그: `select * from cron.job_run_details order by start_time desc limit 10;`
- Vercel 함수 로그에 `/api/cron/body-backfill` 10분 간격 호출 확인.
- 큐 감소: `select count(*) from contents where status='pending' and body_fetched_at is null;` 가 시간당 줄어드는지.
- 게시 승격: flip 후 그간 안 보이던 소스 기사가 published 로 올라오는지(425 육안과 연동).

## 4. 리스크
- **함수 사용량**: 10분마다 호출 × 최대 300s → Hobby 함수 실행시간 총량 확인. 각 호출을 짧게(C1-2) 하면 여유.
- **CRON_SECRET 노출**: Vault 에만. pg_cron 잡 정의에 평문 금지(위처럼 vault 참조).
- **pg_net 응답**: fire-and-forget(비동기). 실패해도 다음 10분에 재시도되므로 큐는 결국 드레인됨. 실패 지속 시 job_run_details 로 확인.

## 5. 다음
- 이 워커가 서면 **백필(과거기사)·재시도 큐·424 보고서 생성**도 같은 패턴(pg_cron → Vercel 엔드포인트)으로 확장.
