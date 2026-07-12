import type { NextRequest } from 'next/server'
import { runNewsletterDispatch } from '@/lib/newsletter/dispatch'
import { createAdminClient } from '@/lib/supabase/admin'
import { runJob } from '@/lib/jobs/run-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const result = await runJob(admin, { key: 'cron:newsletter', trigger: 'cron' }, async () => {
      return runNewsletterDispatch({ triggeredBy: 'cron' })
    })
    return Response.json(result)
  } catch (err) {
    console.error('[크론/newsletter] 발송 오류:', err)
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ ok: false, error: '뉴스레터 발송 중 오류가 발생했습니다.', detail: message }, { status: 500 })
  }
}
