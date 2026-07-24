import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateEntityEvents } from '@/lib/entities/generate-events'

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
 * POST /api/admin/entities/[id]/events
 * 엔티티 사건 타임라인 생성 (재생성 멱등: delete → insert)
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error: authError } = await verifyAdmin()
  if (authError) return authError

  const { id } = await params

  try {
    const admin = createAdminClient()

    // LLM 생성
    const { events, errorReason } = await generateEntityEvents(admin, id)

    if (events.length === 0) {
      return NextResponse.json(
        { error: `사건 타임라인 생성 실패: ${errorReason ?? '알 수 없는 원인'}` },
        { status: 503 }
      )
    }

    // 재생성 멱등: 기존 삭제 → 배치 insert
    const { error: deleteError } = await admin
      .from('entity_events')
      .delete()
      .eq('entity_id', id)

    if (deleteError) {
      console.error('[events] 삭제 오류:', deleteError.message)
      return NextResponse.json({ error: '기존 데이터 삭제 실패' }, { status: 500 })
    }

    const rows = events.map(ev => ({
      entity_id: id,
      event_date: ev.event_date,
      signal_type: ev.signal_type,
      headline: ev.headline,
      detail: ev.detail,
      biz_impact: ev.biz_impact,
      biz_impact_reason: ev.biz_impact_reason,
      source_content_ids: ev.citations,
      citations: ev.citations,
      model: 'report',
    }))

    const { error: insertError } = await admin
      .from('entity_events')
      .insert(rows)

    if (insertError) {
      console.error('[events] 삽입 오류:', insertError.message)
      return NextResponse.json({ error: '저장 실패' }, { status: 500 })
    }

    return NextResponse.json({ count: events.length })
  } catch (err) {
    console.error('[POST /api/admin/entities/[id]/events] 오류:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
