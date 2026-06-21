import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { classifySentiment } from '@/lib/insight/sentiment'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) }
  }

  return { error: null }
}

/**
 * POST /api/admin/sentiment
 * body: { days?: number (기본 14), max?: number (기본 40, 상한 100) }
 * 경쟁사 기사 sentiment 백필 트리거
 */
export async function POST(request: NextRequest) {
  try {
    const { error: authError } = await verifyAdmin()
    if (authError) return authError

    let days = 14
    let max = 40
    try {
      const body = await request.json() as Record<string, unknown>
      if (typeof body.days === 'number' && body.days > 0) days = body.days
      if (typeof body.max === 'number' && body.max > 0) max = Math.min(body.max, 100)
    } catch { /* body 파싱 실패 시 기본값 사용 */ }

    const supabase = createAdminClient()

    // 1. 경쟁사 이름 조회 (entities.is_competitor 기준)
    const { data: kwData } = await supabase
      .from('entities')
      .select('canonical_name')
      .eq('is_competitor', true)
      .limit(50)

    const names = (kwData ?? []).map((k: { canonical_name: string }) => k.canonical_name).filter(Boolean)
    if (names.length === 0) {
      return NextResponse.json({ analyzed: 0, candidates: 0, reason: '경쟁사 엔티티 미등록' })
    }

    // 2. 후보 기사 조회 (KST 기준 since)
    const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000
    const since = new Date(sinceMs).toISOString()

    const { data: candidates } = await supabase
      .from('contents')
      .select('id, title, summary_ko, body_original')
      .eq('status', 'published')
      .is('sentiment', null)
      .gte('collected_at', since)
      .overlaps('matched_keywords', names)
      .order('collected_at', { ascending: false })
      .limit(max)

    const rows = (candidates ?? []) as {
      id: string
      title: string
      summary_ko: string | null
      body_original: string | null
    }[]

    if (rows.length === 0) {
      return NextResponse.json({ analyzed: 0, candidates: 0 })
    }

    // 3. 순차 루프: classifySentiment → update
    let analyzed = 0
    let nullCount = 0
    for (const row of rows) {
      const snippet = row.summary_ko ?? row.body_original?.slice(0, 300) ?? row.title
      const result = await classifySentiment(row.title, snippet)
      if (!result) { nullCount++; continue }

      const { error } = await supabase
        .from('contents')
        .update({ sentiment: result })
        .eq('id', row.id)

      if (!error) analyzed++
    }

    return NextResponse.json({ analyzed, candidates: rows.length, nullCount })
  } catch (err) {
    console.error('[sentiment backfill]', err)
    return NextResponse.json({ error: '논조 분석 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
