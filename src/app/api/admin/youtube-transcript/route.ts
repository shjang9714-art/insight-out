import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { drainYoutubeTranscriptBackfill } from '@/lib/contents/youtube-transcript-backfill'
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
 * POST /api/admin/youtube-transcript?limit=N&mode=fresh|retry
 * 유튜브(category='유튜브') 자막 수집·번역(단일 배치). limit: 1~20, 기본 10.
 * mode=fresh(기본): transcript_fetched_at 미시도. mode=retry: 과거 실패행(자막 없음/오류)만 재대상.
 * transcript_fetched_at 컬럼 미적용(42703) 시 { ready: false }(265 SQL 적용 필요).
 */
export async function POST(request: NextRequest) {
  const { error: authError, userId } = await verifyAdmin()
  if (authError) return authError

  const sp = request.nextUrl.searchParams
  const limitParam = sp.get('limit')
  const limit = Math.min(Math.max(parseInt(limitParam || '10', 10) || 10, 1), 20)
  const mode = sp.get('mode') === 'retry' ? 'retry' : 'fresh'

  const admin = createAdminClient()
  const result = await runJob(admin, { key: 'admin:youtube-transcript', trigger: 'admin', mode, startedBy: userId ?? undefined }, () =>
    drainYoutubeTranscriptBackfill(admin, { limit, mode })
  )
  return NextResponse.json(result)
}
