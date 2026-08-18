import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { detectOpsIssues } from '@/lib/ops/detect-issues'
import { runJob } from '@/lib/jobs/run-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET ?? ''}`) return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  try {
    const admin = createAdminClient()
    // 527-A — 긴급 메일 발송 폐지(알림 채널 일원화, ①⑨와 별도 긴급 메일이 각각 다르게
    // 보여주던 문제). 이 크론은 10분 주기로 ops_issues 를 갱신하는 유일한 경로라
    // detectOpsIssues 호출은 그대로 유지한다.
    const result = await runJob(admin, { key: 'cron:ops-alert', trigger: 'cron' }, async () => {
      const { open, resolved } = await detectOpsIssues(admin)
      return { ok: true, open, resolved }
    })
    return Response.json(result)
  } catch (err) {
    console.error('[크론/ops-alert] 오류:', err)
    return Response.json({ ok: false, error: '운영 이슈 감지 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
