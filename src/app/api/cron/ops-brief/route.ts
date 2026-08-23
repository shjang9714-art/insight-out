import type { NextRequest } from 'next/server'
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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET ?? ''}`) {
    return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  }
  try {
    const admin = createAdminClient()
    const result = await runJob(admin, { key: 'cron:ops-brief', trigger: 'cron' }, async () => {
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
