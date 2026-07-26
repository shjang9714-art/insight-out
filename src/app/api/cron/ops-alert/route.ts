import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendBrevoEmail } from '@/lib/email/brevo'
import { detectOpsIssues } from '@/lib/ops/detect-issues'
import { getOpsRecipients } from '@/lib/ops/recipients'
import { runJob } from '@/lib/jobs/run-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET ?? ''}`) return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  try {
    const admin = createAdminClient()
    const result = await runJob(admin, { key: 'cron:ops-alert', trigger: 'cron' }, async () => {
      await detectOpsIssues(admin)
      const { data: issues, error } = await admin.from('ops_issues').select('id, title, suspected_cause, recommended_action, occurrence_count').eq('severity', 'critical').eq('status', 'open').is('alerted_at', null).order('last_seen_at', { ascending: false })
      if (error) throw error
      if (!issues?.length) return { ok: true, alerted: 0 }
      const recipients = await getOpsRecipients(admin)
      if (!recipients.length) return { ok: true, alerted: 0, skipped: true, reason: '수신 관리자 없음' }
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://insight-out-app.vercel.app'
      const html = `<h1>긴급 운영 이슈 ${issues.length}건</h1><ul>${issues.map(i => `<li><b>${i.title}</b><br>추정 원인: ${i.suspected_cause ?? '-'}<br>권장 조치: ${i.recommended_action ?? '-'}<br>발생: ${i.occurrence_count}회</li>`).join('')}</ul><p><a href="${appUrl}/admin/ops-issues">운영 이슈 화면 열기</a></p>`
      const messageId = await sendBrevoEmail({ to: recipients, subject: `[인사이트 아웃 🔴 긴급 ${issues.length}건] ${issues[0].title}`, html })
      const ids = issues.map(i => i.id)
      const { error: markError } = await admin.from('ops_issues').update({ alerted_at: new Date().toISOString() }).in('id', ids).is('alerted_at', null)
      if (markError) throw markError
      return { ok: true, alerted: issues.length, messageId }
    })
    return Response.json(result)
  } catch (err) {
    console.error('[크론/ops-alert] 오류:', err)
    return Response.json({ ok: false, error: '긴급 운영 알림 발송 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
