import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { drainClusterBackfill } from '@/lib/crawler/cluster-backfill'
import { runJob } from '@/lib/jobs/run-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

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
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }), userId: null }
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }), userId: null }
  }

  return { error: null, userId: user.id }
}

/**
 * POST /api/admin/cluster-backfill?limit=N&from=YYYY-MM-DD&to=YYYY-MM-DD
 * 뉴스 중 cluster_checked_at IS NULL·body_fetched_at IS NOT NULL 대상으로
 * 본문 유사도 재클러스터링(단일 배치). limit: 1~30, 기본 20.
 * cluster_checked_at 컬럼 미적용(42703) 시 { ready: false }(220 SQL 적용 필요).
 */
export async function POST(request: NextRequest) {
  const { error: authError, userId } = await verifyAdmin()
  if (authError) return authError

  const sp = request.nextUrl.searchParams
  const limitParam = sp.get('limit')
  const limit = Math.min(Math.max(parseInt(limitParam || '20', 10) || 20, 1), 30)
  const from = sp.get('from')
  const to = sp.get('to')

  const admin = createAdminClient()
  const result = await runJob(admin, { key: 'admin:cluster-backfill', trigger: 'admin', startedBy: userId ?? undefined }, () =>
    drainClusterBackfill(admin, { limit, from, to })
  )
  return NextResponse.json(result)
}
