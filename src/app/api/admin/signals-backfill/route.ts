import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { drainSignals } from '@/lib/contents/classify-signals'
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
 * POST /api/admin/signals-backfill?limit=N
 * signals_classified_at IS NULL 인 published 콘텐츠를 신호 분류 (단일 배치).
 * limit: 1~20, 기본 10.
 */
export async function POST(request: NextRequest) {
  const { error: authError, userId } = await verifyAdmin()
  if (authError) return authError

  const sp = request.nextUrl.searchParams
  const limitParam = sp.get('limit')
  const limit = Math.min(Math.max(parseInt(limitParam || '10', 10) || 10, 1), 20)

  const admin = createAdminClient()
  const result = await runJob(admin, { key: 'admin:signals-backfill', trigger: 'admin', startedBy: userId ?? undefined }, () =>
    drainSignals(admin, { limit })
  )

  if (result.remaining === -1) {
    return NextResponse.json(
      {
        error:
          'signals_classified_at 컬럼이 아직 적용되지 않았습니다. 수희가 137-signals-classified-marker.sql을 실행한 후 사용 가능합니다.',
      },
      { status: 503 },
    )
  }

  return NextResponse.json(result)
}
