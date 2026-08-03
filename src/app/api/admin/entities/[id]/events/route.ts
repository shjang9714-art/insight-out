import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextRequest, NextResponse } from 'next/server'
import { generateEntityEvents } from '@/lib/entities/generate-events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60


/**
 * POST /api/admin/entities/[id]/events
 * 엔티티 사건 타임라인 생성 (재생성 멱등: delete → insert)
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  const { id } = await params

  try {
    const admin = gate.admin

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
