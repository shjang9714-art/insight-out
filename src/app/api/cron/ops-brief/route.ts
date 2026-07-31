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
      const brief = await gatherDailyBrief(admin)
      const recipients = await getOpsRecipients(admin)
      if (!recipients.length) return { ok: true, skipped: true, reason: '수신 관리자 없음', alerts: brief.alerts.length }
      const subject = buildDailyBriefSubject(brief)
      const messageId = await sendBrevoEmail({ to: recipients, subject, html: buildDailyBriefHtml(brief) })
      return { ok: true, sent: recipients.length, messageId, subject, alerts: brief.alerts.length }
    })
    return Response.json(result)
  } catch (err) {
    console.error('[크론/ops-brief] 오류:', err)
    return Response.json({ ok: false, error: '운영 브리핑 발송 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
