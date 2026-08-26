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

    // 578 — 관계지도 lift 엣지의 원천. 실시간 계산은 2.77초라 매트뷰로 내렸다.
    // 비동시 갱신이 ~3초간 ACCESS EXCLUSIVE 락을 잡는다 — KST 05:50 이라 수용한다.
    const { data: pairData, error: pairError } = await admin.rpc('refresh_entity_pair_stats')
    if (pairError) throw new Error(`엔티티 쌍 통계 갱신 실패: ${pairError.message}`)

    const pairs = Number(pairData)
    if (!Number.isFinite(pairs)) {
      throw new Error('엔티티 쌍 통계 갱신 결과가 숫자가 아닙니다.')
    }

    return { ok: true as const, updated, pairs }
  })
  return Response.json(result)
}
