import type { NextRequest } from 'next/server'
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

  const admin = createAdminClient()
  const result = await runJob(admin, { key: 'cron:entity-metrics-refresh', trigger: 'cron' }, async () => {
    const { data, error } = await admin.rpc('refresh_entity_mention_counts')
    if (error) throw new Error(`엔티티 언급 수 갱신 실패: ${error.message}`)

    const updated = Number(data)
    if (!Number.isFinite(updated)) {
      throw new Error('엔티티 언급 수 갱신 결과가 숫자가 아닙니다.')
    }

    return { ok: true as const, updated }
  })
  return Response.json(result)
}
