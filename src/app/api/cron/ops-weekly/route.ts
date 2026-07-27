import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendBrevoEmail } from '@/lib/email/brevo'
import { gatherWeeklyReport, buildWeeklyReportHtml } from '@/lib/ops/weekly-report'
import { runJob } from '@/lib/jobs/run-job'
import { getOpsRecipients } from '@/lib/ops/recipients'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET ?? ''}`) return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  try {
    const admin = createAdminClient()
    const result = await runJob(admin, { key: 'cron:ops-weekly', trigger: 'cron' }, async () => {
      const report = await gatherWeeklyReport(admin)
      const recipients = await getOpsRecipients(admin)
      if (!recipients.length) return { ok: true, skipped: true, reason: '수신 관리자 없음' }
      const fmt = (value: string) => new Date(value).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' })
      const subject = `[인사이트 아웃 주간 운영 리포트] ${fmt(report.periodStart)}~${fmt(report.periodEnd)} · 미해결 ${report.issues.stillOpen}`
      const messageId = await sendBrevoEmail({ to: recipients, subject, html: buildWeeklyReportHtml(report) })
      return { ok: true, sent: recipients.length, messageId, subject, stillOpen: report.issues.stillOpen }
    })
    return Response.json(result)
  } catch (err) {
    console.error('[크론/ops-weekly] 오류:', err)
    return Response.json({ ok: false, error: '주간 운영 리포트 발송 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
