import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { enrichOneBody, type EnrichBodyRow } from '@/lib/contents/enrich-body'

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
 * POST /api/admin/body-backfill?limit=N
 * body_fetched_at IS NULL 전체 대상으로 풀본문 백필.
 * limit: 1~30, 기본 15 (추출 6초/건 기준).
 */
export async function POST(request: NextRequest) {
  const denied = await verifyAdmin()
  if (denied) return denied

  const limitParam = request.nextUrl.searchParams.get('limit')
  const limit = Math.min(Math.max(parseInt(limitParam || '15', 10) || 15, 1), 30)

  const admin = createAdminClient()

  const { data: targets, error: queryError } = await admin
    .from('contents')
    .select('id, original_url, body_original')
    .is('body_fetched_at', null)
    .not('original_url', 'is', null)
    .order('collected_at', { ascending: false })
    .limit(limit)

  if (queryError) {
    return NextResponse.json(
      { error: '대상 조회 실패: ' + queryError.message },
      { status: 500 }
    )
  }

  const rows = (targets ?? []) as EnrichBodyRow[]

  if (rows.length === 0) {
    const { count } = await admin
      .from('contents')
      .select('id', { count: 'exact', head: true })
      .is('body_fetched_at', null)
      .not('original_url', 'is', null)

    return NextResponse.json({ processed: 0, improved: 0, skipped: 0, remaining: count ?? 0 })
  }

  let improved = 0
  let skipped = 0

  for (const row of rows) {
    const result = await enrichOneBody(admin, row)
    if (result === 'improved') improved++
    else skipped++
  }

  const { count: remaining } = await admin
    .from('contents')
    .select('id', { count: 'exact', head: true })
    .is('body_fetched_at', null)
    .not('original_url', 'is', null)

  return NextResponse.json({
    processed: rows.length,
    improved,
    skipped,
    remaining: remaining ?? 0,
  })
}
