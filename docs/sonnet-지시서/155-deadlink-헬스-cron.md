# 지시서 155 — 수집 품질 ③: dead-link 헬스 cron + 링크 비활성·안내

> 작성: Opus(Cowork) · 2026-06-24 · 레인: 데이터+AI MI
> 근거: 151 §6 후속. 151은 구글뉴스 *미해소*만 고침 — 진짜 죽은 링크(404·사라진 도메인)는 여전히 클릭 시 깨짐. David "눌렀는데 안 열림 = 최대 이탈".
> David 결정: 죽은 링크 = **콘텐츠 유지 + 원문 링크만 비활성·안내**(도구적, 사용자 쿼리 무변경).
> 협업 루프: 로컬(커밋X). SQL 핸드오프 먼저 푸시(수희). David 위임 → 구현 → Opus 검증 → "커밋".

---

## 0. 한 줄

published 원문 링크를 cron이 주기적으로 점검해 **확실히 죽은 것(404/410)만 보수적으로** `link_ok=false`로 마킹하고, 상세의 "원문 보기"를 비활성+안내로 바꾼다. 151 source 라우트는 dead면 상세로 백스톱(카드 클릭도 안전). 콘텐츠 자체는 그대로(제목·요약 가치 유지). 오판 방지가 1순위 — 타임아웃·405·5xx는 dead로 보지 않는다.

## 1. 현행 진단

- 151 `/api/contents/[id]/source` — 클릭 시 `resolveArticleUrl`로 구글뉴스 해소 + 자가치유. **하지만 원문이 실제 404/삭제면 그 죽은 URL로 그대로 보냄.**
- 원문 링크 점검·상태 추적 **전무**. 152 콘텐츠 건강의 "원문 링크 위험"은 *구글뉴스 미해소* 수만(dead 아님).
- cron 인프라: vercel.json crons + CRON_SECRET 패턴(ai-refresh·briefing 등).

## 2. DB / SQL 핸드오프 (먼저 푸시)

`docs/sql-handoff/155-link-health.sql`:
```sql
-- 155: 원문 링크 헬스. nullable=미점검. 후방호환.
ALTER TABLE contents ADD COLUMN IF NOT EXISTS link_ok boolean;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS link_checked_at timestamptz;
```
멱등·안전. 미적용 시 코드 graceful(점검 skip·링크 정상 표시).

---

## 3. 구현

### 3-1. `src/lib/contents/link-health.ts` (신규, server-only)

보수적 판정 — **확실한 dead만 false**.

```ts
import 'server-only'

export type LinkHealth = 'ok' | 'dead' | 'unknown'

/** 보수적 링크 점검. 404/410=dead, 2xx/3xx=ok, 그 외(405·403·5xx·타임아웃)=unknown(마킹 보류). */
export async function checkLink(url: string): Promise<LinkHealth> {
  const probe = async (method: 'HEAD' | 'GET'): Promise<LinkHealth> => {
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; InsightOutBot/1.0)' },
      })
      if (res.status === 404 || res.status === 410) return 'dead'
      if (res.ok || (res.status >= 300 && res.status < 400)) return 'ok'
      return 'unknown' // 403/405/5xx 등 → 판단 보류
    } catch {
      return 'unknown' // 타임아웃·네트워크 → 보류(오판 금지)
    }
  }
  // HEAD 우선, HEAD가 unknown이면 GET 1회로 확인(HEAD 막는 사이트 대응)
  const head = await probe('HEAD')
  if (head !== 'unknown') return head
  return probe('GET')
}
```

### 3-2. `src/app/api/cron/link-health/route.ts` (신규)

ai-refresh 패턴 미러(CRON_SECRET·deadline). 미점검(link_checked_at null) 우선 → 오래된 순 드레인.

```ts
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkLink } from '@/lib/contents/link-health'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const BATCH = 40

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  }
  const deadline = Date.now() + 100_000
  const admin = createAdminClient()

  // 대상: published·원문 있음, 미점검 우선 → 오래된 순
  const { data, error } = await admin
    .from('contents')
    .select('id, original_url, link_checked_at')
    .eq('status', 'published')
    .not('original_url', 'is', null)
    .order('link_checked_at', { ascending: true, nullsFirst: true })
    .limit(BATCH)

  if (error) {
    // 42703(컬럼 미적용) 등 → graceful 종료
    return Response.json({ ok: true, skipped: true, reason: error.message })
  }

  let checked = 0, dead = 0
  for (const row of (data ?? []) as { id: string; original_url: string }[]) {
    if (Date.now() >= deadline) break
    const health = await checkLink(row.original_url)
    // unknown은 link_ok 안 건드림(이전 값 유지), checked_at만 갱신해 재점검 큐 뒤로
    const patch: Record<string, unknown> = { link_checked_at: new Date().toISOString() }
    if (health === 'dead') { patch.link_ok = false; dead++ }
    else if (health === 'ok') { patch.link_ok = true }
    await admin.from('contents').update(patch).eq('id', row.id)
    checked++
  }

  return Response.json({ ok: true, checked, dead })
}
```

### 3-3. `vercel.json` — cron 등록

crons 배열에 추가(다른 cron과 시간 분산):
```json
{ "path": "/api/cron/link-health", "schedule": "0 17 * * *" }
```
(17:00 UTC = 02:00 KST, 기존 cron들과 겹치지 않게.)

### 3-4. `src/app/dashboard/contents/[id]/page.tsx` — dead면 원문 링크 비활성·안내

본문 콘텐츠 로드 후 **별도 가드 쿼리**로 link_ok 조회(148 패턴 — 메인 select 무변경, 42703 graceful):
```ts
let linkOk: boolean | null = null
{
  const { data: lh } = await supabase.from('contents').select('link_ok').eq('id', id).single()
  linkOk = (lh as { link_ok: boolean | null } | null)?.link_ok ?? null
}
const linkDead = linkOk === false
```
"원문 보기" 렌더(3곳): `linkDead`면 링크 대신 비활성 표시:
```tsx
{content.original_url && (
  linkDead ? (
    <span className="... text-muted-foreground cursor-not-allowed opacity-60" title="원문을 찾을 수 없습니다">
      <ExternalLink className="..." /> 원문 없음
    </span>
  ) : (
    <a href={`/api/contents/${content.id}/source`} target="_blank" rel="noopener noreferrer" ...>
      <ExternalLink className="..." /> 원문 보기
    </a>
  )
)}
```
(linkOk null=미점검/컬럼없음 → 기존대로 링크 표시. 회귀 0.)

### 3-5. `src/app/api/contents/[id]/source/route.ts` (151) — dead 백스톱

source select에 link_ok 추가, dead면 상세로(카드에서 클릭해도 안전):
```ts
const { data } = await supabase.from('contents').select('id, original_url, link_ok').eq('id', id).single()
const row = data as { original_url: string | null; link_ok: boolean | null } | null
if (row?.link_ok === false) return NextResponse.redirect(detailUrl, 302) // dead → 상세
// (이하 기존: originalUrl 없으면 상세 / resolve / 자가치유 / 302)
```
(link_ok 컬럼 미적용 시 select 42703 → 기존 graceful 경로 유지하도록 select를 originalUrl만으로 폴백하거나, 단일 select 실패 시 상세 폴백. **메인 동작 깨지지 않게**.)

### 3-6. `src/components/admin/AdminContentHealth.tsx` + `admin/page.tsx` (152) — dead 수 가시화

- page.tsx head-count 1개 추가: `.eq('status','published').eq('link_ok', false)` → `deadLinks`.
- ContentHealth에 `deadLinks` 추가, "원문 링크 위험" 행을 *구글뉴스 미해소 + 죽은 링크 N건*으로 확장 표시.
- 42703 graceful(컬럼 없으면 0).

---

## 4. 회귀 가드 / 비기능 요건

- **오판 방지 최우선**: 404/410만 dead. 타임아웃·403·405·5xx=unknown(마킹 안 함). 살아있는 링크를 죽었다고 잘못 끄는 것이 최악.
- link_ok null(미점검/컬럼없음) → 링크 정상 표시. **회귀 0.**
- 콘텐츠 자체 비노출·삭제 없음(제목·요약 유지). 사용자 피드/검색/이슈 쿼리 무변경.
- cron deadline·BATCH 바운디드. unknown도 checked_at 갱신 → 재점검 큐 순환.
- SQL 미적용 → cron·가드쿼리 graceful skip. UI 링크 정상.
- 하드코딩 hex 0(기존 토큰).

## 5. 검증 (Sonnet 자체)

1. `npx tsc --noEmit` 0
2. `npx eslint` 0
3. hex grep 0
4. link_ok 42703 graceful: 컬럼 없이 상세·source·cron·health 전부 안 깨짐
5. checkLink 보수성: 404→dead, 200/301→ok, 403/405/타임아웃→unknown(마킹 보류) 로직 점검

## 6. 후속 (범위 밖)

- 카드(ContentRow·ContentListCard) 레벨 dead 비활성 배지(현재는 source 라우트 백스톱으로 안전 이동).
- dead 자동 재확인(일시적 404 회복 시 ok 복귀 — cron 순환이 이미 처리).
- 사용자 "원문 없음" 콘텐츠 정렬 후순위/필터.
- 151 자가치유 + 155 헬스 통합 리포트.

---

## 7. 라이브 검증 체크리스트 추가분 (§22 신설)

- [ ] 수희 `155-link-health.sql` 적용
- [ ] cron(`/api/cron/link-health`, 02:00 KST) 후 link_checked_at 채워지고 일부 link_ok=false
- [ ] 죽은 링크 기사 상세 → "원문 보기" 대신 "원문 없음"(비활성+안내), 콘텐츠 본문은 정상
- [ ] 카드에서 죽은 링크 클릭 → 깨진 페이지 대신 상세로 이동(백스톱)
- [ ] 152 콘텐츠 건강에 죽은 링크 수 표시
- [ ] 살아있는 링크는 정상(오판 0), SQL 미적용/미점검 → 링크 정상 표시(회귀 0)
