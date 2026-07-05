import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateHighlights } from '@/lib/briefing/highlights'

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
 * POST /api/admin/briefings/[id]/highlights
 * 어드민 전용 — 기존 브리핑의 source_content_ids 로 홈 카드용 핵심 인사이트 3줄을 (재)생성.
 * 스크립트/오디오는 건드리지 않고 highlights 컬럼만 갱신하는 가벼운 백필 경로.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await verifyAdmin()
    if (authError) return authError

    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: '브리핑 ID가 필요합니다.' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: briefing, error: bErr } = await admin
      .from('briefings')
      .select('id, source_content_ids')
      .eq('id', id)
      .single()

    if (bErr || !briefing) {
      return NextResponse.json({ error: '브리핑을 찾을 수 없습니다.' }, { status: 404 })
    }

    const ids = ((briefing.source_content_ids ?? []) as string[]).slice(0, 5)
    if (ids.length === 0) {
      return NextResponse.json({ error: '선정 기사가 없어 인사이트를 생성할 수 없습니다.' }, { status: 400 })
    }

    const { data: contents } = await admin
      .from('contents')
      .select('id, title, summary_ko')
      .in('id', ids)

    const byId = new Map((contents ?? []).map(c => [c.id, c]))
    // source 순서 보존
    const ordered = ids
      .map(cid => byId.get(cid))
      .filter((c): c is { id: string; title: string; summary_ko: string | null } => !!c)

    const highlights = await generateHighlights(ordered)

    if (highlights.length === 0) {
      return NextResponse.json({ ok: false, reason: '인사이트 생성 실패(LLM 응답 없음)' }, { status: 502 })
    }

    const { error: updErr } = await admin
      .from('briefings')
      .update({ highlights })
      .eq('id', id)

    if (updErr) {
      return NextResponse.json({ error: 'DB 저장 실패: ' + updErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, count: highlights.length, highlights }, { status: 200 })
  } catch (err) {
    console.error('[/api/admin/briefings/[id]/highlights] 오류:', err)
    return NextResponse.json(
      { error: '인사이트 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
