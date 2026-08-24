import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendResendEmail } from '@/lib/email/resend'
import {
  buildDailyBriefHtml,
  buildDailyBriefSubject,
  gatherDailyBrief,
} from '@/lib/ops/daily-brief'
import { runJob } from '@/lib/jobs/run-job'
import { detectOpsIssues } from '@/lib/ops/detect-issues'
import { getOpsRecipients } from '@/lib/ops/recipients'
import { cleanupExpiredTrash } from '@/lib/ops/trash-cleanup'
import { recordDailySnapshot } from '@/lib/ops/daily-snapshot'
import { getKstTodayStartIso } from '@/lib/date'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * 오늘(KST) 이미 이 크론이 succeeded/skipped 로 끝난 적이 있는지 확인한다.
 * 08:15 catch-up 크론(vercel.json `?run=catchup`)이 08:00 정규 tick 뒤에 중복 발송하지
 * 않도록 하는 멱등 가드 — ops-brief 는 뉴스레터의 last_sent_on 같은 자체 상태 컬럼이 없어
 * job_runs 이력을 그 대신 근거로 삼는다. 'running'(현재 실행 자신 포함)·'failed' 는 제외해
 * 유실·에러로 못 보낸 날은 catch-up 이 정상적으로 재시도할 수 있게 한다.
 */
async function hasOpsBriefRunToday(admin: SupabaseClient): Promise<boolean> {
  const { data, error } = await admin
    .from('job_runs')
    .select('id')
    .eq('job_key', 'cron:ops-brief')
    .in('status', ['succeeded', 'skipped'])
    .gte('started_at', getKstTodayStartIso())
    .limit(1)

  if (error) {
    console.error('[크론/ops-brief] 중복 실행 확인 실패, 안전하게 실행 허용:', error.message)
    return false
  }
  return (data?.length ?? 0) > 0
}

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET ?? ''}`) {
    return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  }
  const isCatchup = request.nextUrl.searchParams.get('run') === 'catchup'
  try {
    const admin = createAdminClient()
    const result = await runJob(admin, { key: 'cron:ops-brief', trigger: 'cron', mode: isCatchup ? 'catchup' : undefined }, async () => {
      if (await hasOpsBriefRunToday(admin)) {
        return { ok: true, skipped: 'already_run_today' as const }
      }
      await detectOpsIssues(admin)
      // 492 · 3단계 C — 휴지통 30일 초과분 자동 정리. 새 cron 신설 대신 기존 ops-brief 안에서 처리.
      // cleanupExpiredTrash 는 실패해도 예외를 던지지 않으므로 브리핑 발송 본체는 계속 돈다.
      const trashCleanup = await cleanupExpiredTrash(admin)
      const brief = await gatherDailyBrief(admin)
      brief.system.trashCleanup = { available: !trashCleanup.error, value: { deleted: trashCleanup.deleted, capped: trashCleanup.capped } }
      // 527-A-fix — 스냅샷의 snapshot_date 는 리포트가 다루는 대상일(brief.period.date,
      // gatherDailyBrief 내부 getReportDays().report 와 동일 소스)과 반드시 같아야 한다.
      // 크론이 08:00 KST 에 도는데 스냅샷 기본값(오늘)을 그대로 쓰면 그날 0~8시분만
      // 담긴 부분값이 영구히 저장된다 — 리포트 본문(전일 전체)과 스냅샷 지표가 어긋난다.
      // 적재 실패가 리포트 발송을 막으면 안 되므로 예외를 삼키되, 조용히 넘기지 않고
      // job_runs.meta.snapshotError 로 흔적을 남긴다.
      let snapshotError: string | null = null
      try {
        await recordDailySnapshot(admin, brief.period.date)
      } catch (err) {
        snapshotError = err instanceof Error ? err.message : String(err)
        console.error('[크론/ops-brief] 운영 스냅샷 적재 실패:', snapshotError)
      }
      const recipients = await getOpsRecipients(admin)
      if (!recipients.length) return { ok: true, skipped: true, reason: '수신 관리자 없음', alerts: brief.alerts.length, trashDeleted: trashCleanup.deleted, trashCapped: trashCleanup.capped, snapshotError }
      const subject = buildDailyBriefSubject(brief)
      const messageId = await sendResendEmail({ to: recipients, subject, html: buildDailyBriefHtml(brief) })
      return { ok: true, sent: recipients.length, messageId, subject, alerts: brief.alerts.length, trashDeleted: trashCleanup.deleted, trashCapped: trashCleanup.capped, snapshotError }
    })
    return Response.json(result)
  } catch (err) {
    console.error('[크론/ops-brief] 오류:', err)
    return Response.json({ ok: false, error: '운영 브리핑 발송 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
