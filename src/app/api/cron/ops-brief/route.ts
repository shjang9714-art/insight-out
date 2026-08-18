import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendBrevoEmail } from '@/lib/email/brevo'
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
      // 527-A — 리포트가 당일 스냅샷을 읽을 수 있도록 발송 전에 먼저 적재한다. 스냅샷
      // 적재 실패가 리포트 발송을 막으면 안 되므로 예외를 삼키되, 조용히 넘기지 않고
      // job_runs.meta.snapshotError 로 흔적을 남긴다.
      let snapshotError: string | null = null
      try {
        await recordDailySnapshot(admin)
      } catch (err) {
        snapshotError = err instanceof Error ? err.message : String(err)
        console.error('[크론/ops-brief] 운영 스냅샷 적재 실패:', snapshotError)
      }
      // 492 · 3단계 C — 휴지통 30일 초과분 자동 정리. 새 cron 신설 대신 기존 ops-brief 안에서 처리.
      // cleanupExpiredTrash 는 실패해도 예외를 던지지 않으므로 브리핑 발송 본체는 계속 돈다.
      const trashCleanup = await cleanupExpiredTrash(admin)
      const brief = await gatherDailyBrief(admin)
      brief.system.trashCleanup = { available: !trashCleanup.error, value: { deleted: trashCleanup.deleted, capped: trashCleanup.capped } }
      const recipients = await getOpsRecipients(admin)
      if (!recipients.length) return { ok: true, skipped: true, reason: '수신 관리자 없음', alerts: brief.alerts.length, trashDeleted: trashCleanup.deleted, trashCapped: trashCleanup.capped, snapshotError }
      const subject = buildDailyBriefSubject(brief)
      const messageId = await sendBrevoEmail({ to: recipients, subject, html: buildDailyBriefHtml(brief) })
      return { ok: true, sent: recipients.length, messageId, subject, alerts: brief.alerts.length, trashDeleted: trashCleanup.deleted, trashCapped: trashCleanup.capped, snapshotError }
    })
    return Response.json(result)
  } catch (err) {
    console.error('[크론/ops-brief] 오류:', err)
    return Response.json({ ok: false, error: '운영 브리핑 발송 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
