import type { NextRequest } from 'next/server'
import { runDiscovery } from '@/lib/ingestion/discovery'
import {
  DISCOVERY_PROVIDERS,
  type DiscoveryProvider,
} from '@/lib/ingestion/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { runJob } from '@/lib/jobs/run-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function parseProviders(raw: string | null): DiscoveryProvider[] | undefined {
  if (!raw) return undefined
  const requested = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is DiscoveryProvider =>
      DISCOVERY_PROVIDERS.includes(value as DiscoveryProvider))
  return requested.length > 0 ? [...new Set(requested)] : undefined
}

/**
 * GET /api/cron/discovery
 *
 * 기사 발견 전용 작업입니다. 본문을 저장하지 않고 Candidate Queue에 후보와 발견 출처를 기록합니다.
 * Supabase pg_cron에서 공급자별 주기에 맞춰 호출하는 것을 전제로 합니다.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  }

  try {
    const providers = parseProviders(request.nextUrl.searchParams.get('providers'))
    const force = request.nextUrl.searchParams.get('force') === 'true'
    const overlapParam = Number(request.nextUrl.searchParams.get('overlapHours'))
    const overlapHours = Number.isFinite(overlapParam) && overlapParam > 0
      ? overlapParam
      : undefined
    const admin = createAdminClient()
    const result = await runJob(
      admin,
      { key: 'cron:discovery', trigger: 'cron' },
      () => runDiscovery({
        providers,
        force,
        overlapHours,
        deadline: Date.now() + 270_000,
      }),
    )
    return Response.json(result)
  } catch (error) {
    console.error('[크론/discovery] 기사 발견 오류:', error)
    return Response.json(
      {
        ok: false,
        error: '기사 발견 중 오류가 발생했습니다.',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
