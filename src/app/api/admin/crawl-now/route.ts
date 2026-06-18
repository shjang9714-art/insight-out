import { after, NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { runCrawl } from '@/lib/crawler/orchestrator'
import {
  summarizeCrawlProgress,
  type CrawlProgressLog,
} from '@/lib/crawler/progress'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function verifyAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json(
      { error: '로그인이 필요합니다.' },
      { status: 401 }
    )
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json(
      { error: '관리자 권한이 필요합니다.' },
      { status: 403 }
    )
  }

  return null
}

/**
 * POST /api/admin/crawl-now
 * 어드민 전용 — 활성 소스 당일분 수집 작업을 백그라운드에서 시작.
 * body { sourceId?: string } — 지정 시 해당 소스만 즉시 수집.
 * CRON_SECRET 불필요 (관리자 인증으로 대체).
 */
export async function POST(request: NextRequest) {
  try {
    const authError = await verifyAdmin()
    if (authError) return authError

    let sourceId: string | undefined
    let backfillDays: number | undefined
    try {
      const b = await request.json()
      sourceId = b?.sourceId
      const raw = b?.backfillDays
      backfillDays = typeof raw === 'number' && raw >= 0 ? raw : undefined
    } catch { /* 전체 수집 */ }

    const admin = createAdminClient()
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

    after(async () => {
      try {
        await runCrawl({ force: true, sourceIds: sourceId ? [sourceId] : undefined, backfillDays })
      } catch (error) {
        console.error('[/api/admin/crawl-now] 백그라운드 수집 오류:', error)
      }
    })

    return NextResponse.json(
      { jobId: startedAt, startedAt, sourcesTotal },
      { status: 202 }
    )
  } catch (err) {
    console.error('[/api/admin/crawl-now] 오류:', err)
    return NextResponse.json(
      { error: '수집 준비 중 오류가 발생했습니다. 서버 설정을 확인해주세요.' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const authError = await verifyAdmin()
    if (authError) return authError

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

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('crawl_logs')
      .select(`
        status, fetched_count, inserted_count, duplicate_count,
        held_count, error_message, started_at, finished_at, sources(name)
      `)
      .gte('started_at', startedAt)
      .order('finished_at', { ascending: false })

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
