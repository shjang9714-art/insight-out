import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { drainPdfCoverBackfill } from '@/lib/contents/pdf-cover-backfill'

// 네이티브 canvas(@napi-rs/canvas) 렌더 — edge 런타임 금지(285).
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
 * POST /api/admin/pdf-cover-backfill?limit=N&mode=fresh|retry
 * 업로드된 PDF(file_path 있음) 중 커버(thumbnail_url) 없는 것에 1페이지 표지 소급 적용(286).
 * limit: 1~10, 기본 5(렌더가 무거워 282 썸네일보다 작은 배치).
 * mode=fresh(기본): 아직 시도 안 함. mode=retry: 과거 실패행(thumbnail_fetched_at 있음)만 재대상.
 * thumbnail_fetched_at 컬럼 미적용(42703) 시 { ready: false }(219 SQL 적용 필요).
 */
export async function POST(request: NextRequest) {
  const denied = await verifyAdmin()
  if (denied) return denied

  const sp = request.nextUrl.searchParams
  const limitParam = sp.get('limit')
  const limit = Math.min(Math.max(parseInt(limitParam || '5', 10) || 5, 1), 10)
  const mode = sp.get('mode') === 'retry' ? 'retry' : 'fresh'

  const admin = createAdminClient()
  const result = await drainPdfCoverBackfill(admin, { limit, mode })
  return NextResponse.json(result)
}
