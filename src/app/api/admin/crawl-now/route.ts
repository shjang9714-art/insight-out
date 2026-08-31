import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { after, NextResponse, type NextRequest } from 'next/server'
import { runCrawl } from '@/lib/crawler/orchestrator'
import { JobAlreadyRunningError, runJob } from '@/lib/jobs/run-job'
import {
  summarizeCrawlProgress,
  type CrawlProgressLog,
} from '@/lib/crawler/progress'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function parseOptionalInteger(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : undefined
}

/**
 * POST /api/admin/crawl-now
 * 어드민 전용 — 활성 소스 당일분 수집 작업을 백그라운드에서 시작.
 * body { sourceId?: string } — 지정 시 해당 소스만 즉시 수집.
 * CRON_SECRET 불필요 (관리자 인증으로 대체).
 */
export async function POST(request: NextRequest) {
  try {
    const gate = await verifyAdminRequest()
    if (!gate.ok) return gate.response

    const similarityCandidateLimit = parseOptionalInteger(request.nextUrl.searchParams.get('similarityLimit'))
    const similaritySinceDays = parseOptionalInteger(request.nextUrl.searchParams.get('similarityDays'))

    let sourceId: string | undefined
    let backfillDays: number | undefined
    try {
      const b = await request.json()
      sourceId = b?.sourceId
      const raw = b?.backfillDays
      backfillDays = typeof raw === 'number' && raw >= 0 ? raw : undefined
    } catch { /* 전체 수집 */ }

    const admin = gate.admin
    let sourcesTotal: number

    if (sourceId) {
      sourcesTotal = 1
    } else {
      const { count, error: countError } = await admin
        .from('sources')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
      if (countError) throw countError
      sourcesTotal = count ?? 0
    }

    const startedAt = new Date().toISOString()

    // 전체 수집 키는 유지하고, 개별 소스는 서로 막지 않도록 소스별 키를 사용한다.
    // 전체 수집 중 개별 수집이 통과하는 트레이드오프는 운영상 의도된 동작이다.
    const jobKey = sourceId ? `admin:crawl-now:${sourceId}` : 'admin:crawl-now'
    const result = await runJob(admin, { key: jobKey, trigger: 'admin', startedBy: gate.userId }, async () => {
      after(async () => {
        try {
          await runCrawl({
            force: true,
            sourceIds: sourceId ? [sourceId] : undefined,
            backfillDays,
            similarityCandidateLimit,
            similaritySinceDays,
          })
        } catch (error) {
          console.error('[/api/admin/crawl-now] 백그라운드 수집 오류:', error)
        }
      })
      return { jobId: startedAt, startedAt, sourcesTotal }
    }, { rejectIfRunning: true })

    return NextResponse.json(
      result,
      { status: 202 }
    )
  } catch (err) {
    if (err instanceof JobAlreadyRunningError) return NextResponse.json({ error: err.message }, { status: 409 })
    console.error('[/api/admin/crawl-now] 오류:', err)
    return NextResponse.json(
      { error: '수집 준비 중 오류가 발생했습니다. 서버 설정을 확인해주세요.' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const gate = await verifyAdminRequest()
    if (!gate.ok) return gate.response

    const startedAt = request.nextUrl.searchParams.get('startedAt')
    const sourcesTotal = Number(
      request.nextUrl.searchParams.get('sourcesTotal')
    )

    if (
      !startedAt
      || Number.isNaN(new Date(startedAt).getTime())
      || !Number.isInteger(sourcesTotal)
      || sourcesTotal < 0
      || sourcesTotal > 500
    ) {
      return NextResponse.json(
        { error: '수집 작업 정보가 올바르지 않습니다.' },
        { status: 400 }
      )
    }

    const admin = gate.admin
    let { data, error } = await admin
      .from('crawl_logs')
      .select(`
        status, fetched_count, inserted_count, duplicate_count,
        held_count, rejected_count, rejected_by, error_message, started_at, finished_at, sources(name)
      `)
      .gte('started_at', startedAt)
      .order('finished_at', { ascending: false })

    // 312 SQL(rejected_count/rejected_by) 미적용 시 undefined_column — 해당 컬럼 없이 재조회.
    if (error?.code === '42703') {
      console.error('[/api/admin/crawl-now] crawl_logs.rejected_count/rejected_by 컬럼 미적용(312 SQL 미실행) — 해당 컬럼 없이 조회:', error.message)
      const retry = await admin
        .from('crawl_logs')
        .select(`
          status, fetched_count, inserted_count, duplicate_count,
          held_count, error_message, started_at, finished_at, sources(name)
        `)
        .gte('started_at', startedAt)
        .order('finished_at', { ascending: false })
      data = retry.data as unknown as typeof data
      error = retry.error
    }

    if (error) throw error

    const logs = (data ?? []) as unknown as CrawlProgressLog[]
    return NextResponse.json(
      summarizeCrawlProgress(logs, sourcesTotal, startedAt)
    )
  } catch (error) {
    console.error('[/api/admin/crawl-now] 진행 상태 조회 오류:', error)
    return NextResponse.json(
      { error: '수집 진행 상태를 불러오지 못했습니다.' },
      { status: 500 }
    )
  }
}
