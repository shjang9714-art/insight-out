import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { drainThumbnailBackfill } from '@/lib/contents/thumbnail-backfill'

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
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })
  }

  return null
}

/**
 * POST /api/admin/thumbnail-backfill?limit=N&from=YYYY-MM-DD&to=YYYY-MM-DD&mode=fresh|retry
 * 뉴스·웹인사이트 중 대상 행에 원문 og:image 재수집(단일 배치). limit: 1~30, 기본 20.
 * mode=fresh(기본): thumbnail_url·thumbnail_fetched_at 모두 NULL. mode=retry: 과거 실패행(thumbnail_fetched_at 있음)만 재대상.
 * thumbnail_fetched_at 컬럼 미적용(42703) 시 { ready: false }(219 SQL 적용 필요).
 */
export async function POST(request: NextRequest) {
  const denied = await verifyAdmin()
  if (denied) return denied

  const sp = request.nextUrl.searchParams
  const limitParam = sp.get('limit')
  const limit = Math.min(Math.max(parseInt(limitParam || '20', 10) || 20, 1), 30)
  const from = sp.get('from')
  const to = sp.get('to')
  const mode = sp.get('mode') === 'retry' ? 'retry' : 'fresh'

  const admin = createAdminClient()
  const result = await drainThumbnailBackfill(admin, { limit, from, to, mode })
  return NextResponse.json(result)
}
