import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { drainBackfill } from '@/lib/contents/enrich-body'
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
 * POST /api/admin/body-backfill?limit=N&from=YYYY-MM-DD&to=YYYY-MM-DD
 * body_fetched_at IS NULL 대상으로 풀본문 백필 (단일 배치).
 * limit: 1~30, 기본 15. from/to: 선택적 수집일 범위 필터.
 */
export async function POST(request: NextRequest) {
  const { error: authError, userId } = await verifyAdmin()
  if (authError) return authError

  const sp = request.nextUrl.searchParams
  const limitParam = sp.get('limit')
  const limit = Math.min(Math.max(parseInt(limitParam || '15', 10) || 15, 1), 30)
  const from = sp.get('from')
  const to = sp.get('to')

  const admin = createAdminClient()
  const result = await runJob(admin, { key: 'admin:body-backfill', trigger: 'admin', startedBy: userId ?? undefined }, () =>
    drainBackfill(admin, { limit, from, to })
  )
  return NextResponse.json(result)
}
