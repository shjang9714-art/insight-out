import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getKstDayStartIso } from '@/lib/date'
import { REVIEW_REASONS } from '@/lib/crawler/quality'

export interface DailySnapshotRow {
  snapshot_date: string
  pending_total: number
  pending_by_reason: Record<string, number>
  body_backlog: number
  users_pending: number
  published_total: number
  rejected_total: number
  collected_day: number
  published_day: number
  pending_in_day: number
  pending_expired_day: number
}

export interface DailySnapshotResult {
  ok: true
  snapshot: DailySnapshotRow
}

/**
 * 527-A — 운영 일일 스냅샷 적재.
 *
 * date 는 호출자가 명시적으로 넘겨야 한다(기본값 없음) — 527-A-fix: ops-brief 리포트가
 * 다루는 "대상일"(getReportDays().report, 통상 전일 KST)과 스냅샷의 snapshot_date 가
 * 반드시 같은 소스에서 나와야 둘이 어긋나지 않는다. 이 함수 자체는 실행 시점을 today 로
 * 가정하지 않으므로, 스톡 값(pending_total 등)의 의미는 "실행 시점의 실측"이 아니라
 * "그 리포트 대상일의 마감 시점(다음날 08:00 KST 크론 실행 시) 잔량"이 된다.
 *
 * 재고(스톡) = 실행 시점 잔량 / 흐름(플로우) = 대상일 하루 증감. 이 구분이 핵심이다 —
 * 섞으면 527-B(리포트)가 다시 못 나눈다.
 *
 *   pending_total        status='pending' and deleted_at is null 현재 건수(스톡)
 *   pending_by_reason     위 조건을 review_reason 별로 집계한 객체(스톡). null 사유는 '_null' 키.
 *   body_backlog          status='pending' and body_fetched_at is null and deleted_at is null (스톡)
 *   users_pending          승인 대기 사용자(users.approval_status='pending') (스톡)
 *   published_total        status='published' 전체 건수(스톡)
 *   rejected_total          status='rejected' 전체 건수(스톡)
 *   collected_day           대상일(KST)에 collected_at 이 속한 건수(플로우 — 그날 유입)
 *   published_day           대상일(KST)에 published_at 이 속한 건수(플로우 — 그날 발행 전환)
 *   pending_in_day           대상일 수집분 중 "현재"(스냅샷 실행 시점) pending 인 건수
 *                            ※ 근사치다 — 나중에 발행 전환되거나 만료되면 이 값은 줄어든다.
 *                            대상일 당일 적재분만 정확하고, 과거 스냅샷 값은 재계산하지 않는다.
 *   pending_expired_day      대상일 job_runs 의 cron:pending-expire 행 meta.total 합(플로우 — 그날 만료)
 *
 * 527-A-fix — 집계 쿼리 중 하나라도 실패하면 0 을 채워 넣지 않고 throw 한다. 조용히 0 을
 * 저장하면 527-B 재고 그래프가 "재고가 사라졌다"로 잘못 읽는다(이 코드베이스에서 반복된
 * 조용한 절단 패턴: 486/497/505/본문보강 drain/검색 타임아웃/525 limit(1000)). 실패한 날은
 * 행을 아예 비워 527-B 가 "데이터 없음"으로 정직하게 표시하게 한다. 호출자(ops-brief)가
 * 이 예외를 잡아 snapshotError 로 남기고 리포트는 계속 보낸다.
 */
export async function recordDailySnapshot(
  admin: SupabaseClient,
  date: string,
): Promise<DailySnapshotResult> {
  const dayStart = getKstDayStartIso(date)
  const dayEnd = new Date(new Date(dayStart).getTime() + 86_400_000).toISOString()

  const [
    pendingTotalRes,
    pendingByReasonEntries,
    bodyBacklogRes,
    usersPendingRes,
    publishedTotalRes,
    rejectedTotalRes,
    collectedDayRes,
    publishedDayRes,
    pendingInDayRes,
    expireRunsRes,
  ] = await Promise.all([
    admin.from('contents').select('id', { count: 'exact', head: true })
      .eq('status', 'pending').is('deleted_at', null),
    Promise.all([...REVIEW_REASONS, null].map(async (reason) => {
      let q = admin.from('contents').select('id', { count: 'exact', head: true })
        .eq('status', 'pending').is('deleted_at', null)
      q = reason === null ? q.is('review_reason', null) : q.eq('review_reason', reason)
      const { count, error } = await q
      return { reason: reason ?? '_null', count, error }
    })),
    admin.from('contents').select('id', { count: 'exact', head: true })
      .eq('status', 'pending').is('body_fetched_at', null).is('deleted_at', null),
    admin.from('users').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending'),
    admin.from('contents').select('id', { count: 'exact', head: true }).eq('status', 'published'),
    admin.from('contents').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
    admin.from('contents').select('id', { count: 'exact', head: true })
      .gte('collected_at', dayStart).lt('collected_at', dayEnd),
    admin.from('contents').select('id', { count: 'exact', head: true })
      .gte('published_at', dayStart).lt('published_at', dayEnd),
    admin.from('contents').select('id', { count: 'exact', head: true })
      .eq('status', 'pending').is('deleted_at', null)
      .gte('collected_at', dayStart).lt('collected_at', dayEnd),
    // job_runs 는 하루 몇 건 안 되므로(수동/재시도 포함해도) 전체 select 로도 1000행 상한에
    // 걸리지 않는다 — meta.total 을 클라이언트에서 합산해야 해서 count 쿼리로 대체 불가.
    admin.from('job_runs').select('meta')
      .eq('job_key', 'cron:pending-expire')
      .gte('started_at', dayStart).lt('started_at', dayEnd),
  ])

  // 527-A-fix — 모든 집계의 error 를 모아 하나라도 실패하면 upsert 하지 않고 throw 한다.
  const failures: string[] = []
  const checkNamed = (name: string, error: { message: string } | null) => {
    if (error) failures.push(`${name}: ${error.message}`)
  }
  checkNamed('pending_total', pendingTotalRes.error)
  for (const { reason, error } of pendingByReasonEntries) checkNamed(`pending_by_reason(${reason})`, error)
  checkNamed('body_backlog', bodyBacklogRes.error)
  checkNamed('users_pending', usersPendingRes.error)
  checkNamed('published_total', publishedTotalRes.error)
  checkNamed('rejected_total', rejectedTotalRes.error)
  checkNamed('collected_day', collectedDayRes.error)
  checkNamed('published_day', publishedDayRes.error)
  checkNamed('pending_in_day', pendingInDayRes.error)
  checkNamed('pending_expired_day', expireRunsRes.error)
  if (failures.length > 0) {
    throw new Error(`[운영 스냅샷] 집계 실패로 저장 중단(${date}): ${failures.join('; ')}`)
  }

  const pendingByReason: Record<string, number> = Object.fromEntries(
    pendingByReasonEntries.map(({ reason, count }) => [reason, count ?? 0])
  )
  const pendingExpiredDay = (expireRunsRes.data ?? []).reduce((sum, row) => {
    const meta = row.meta as { total?: unknown } | null
    const total = typeof meta?.total === 'number' ? meta.total : 0
    return sum + total
  }, 0)

  const snapshot: DailySnapshotRow = {
    snapshot_date: date,
    pending_total: pendingTotalRes.count ?? 0,
    pending_by_reason: pendingByReason,
    body_backlog: bodyBacklogRes.count ?? 0,
    users_pending: usersPendingRes.count ?? 0,
    published_total: publishedTotalRes.count ?? 0,
    rejected_total: rejectedTotalRes.count ?? 0,
    collected_day: collectedDayRes.count ?? 0,
    published_day: publishedDayRes.count ?? 0,
    pending_in_day: pendingInDayRes.count ?? 0,
    pending_expired_day: pendingExpiredDay,
  }

  // upsert — 하루에 여러 번 돌아도 안전해야 한다(snapshot_date 충돌 시 덮어쓴다).
  const { error } = await admin.from('ops_daily_snapshot').upsert(snapshot, { onConflict: 'snapshot_date' })
  if (error) throw error

  return { ok: true, snapshot }
}
