import { NextResponse, type NextRequest } from 'next/server'
import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CwrStatus = 'draft' | 'published' | 'archived'

// 허용된 상태 전이 [현재 → 다음] — briefings/[id] 패턴 재사용
const ALLOWED_TRANSITIONS: Partial<Record<CwrStatus, CwrStatus[]>> = {
  draft: ['published'],
  published: ['draft', 'archived'],
  archived: ['published'],
}

interface RouteContext {
  params: Promise<{ id: string }>
}

interface PatchBody {
  status?: unknown
  summary?: unknown
  sections?: unknown
}

function isPgError(err: unknown): err is { code: string; message: string } {
  return typeof err === 'object' && err !== null && 'code' in err
}

/**
 * PATCH /api/admin/competitor-weekly/[id]
 * (a) 상태전환 { status } — draft/published/archived 허용 전이만.
 * (b) 내용편집 { summary?, sections? } — 261 스키마엔 title 컬럼이 없어(제목은
 *     week_start~week_end 로 표시) summary·sections 만 편집 대상이다.
 * 둘 다 body 에 있으면 한 번에 반영한다.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await verifyAdminRequest()
  if ('response' in auth) return auth.response

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 })

  let body: PatchBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const updatePayload: Record<string, unknown> = {}

  if (body.status !== undefined) {
    const nextStatus = body.status as CwrStatus
    if (!['draft', 'published', 'archived'].includes(nextStatus)) {
      return NextResponse.json(
        { error: 'status 값이 올바르지 않습니다. (draft | published | archived)' },
        { status: 400 },
      )
    }

    const { data: current, error: fetchError } = await auth.admin
      .from('competitor_weekly_reports')
      .select('status')
      .eq('id', id)
      .maybeSingle()

    if (fetchError) {
      if (fetchError.code === '42P01') {
        return NextResponse.json({ error: '경쟁사 주간 브리핑 테이블이 아직 준비되지 않았습니다 (SQL 미적용).' }, { status: 503 })
      }
      return NextResponse.json({ error: `조회 실패: ${fetchError.message}` }, { status: 500 })
    }
    if (!current) return NextResponse.json({ error: '해당 브리핑을 찾을 수 없습니다.' }, { status: 404 })

    const currentStatus = current.status as CwrStatus
    const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? []
    if (!allowed.includes(nextStatus)) {
      return NextResponse.json({ error: '허용되지 않는 상태 전이입니다.' }, { status: 400 })
    }
    updatePayload.status = nextStatus
  }

  if (body.summary !== undefined) {
    if (typeof body.summary !== 'string') {
      return NextResponse.json({ error: 'summary 는 문자열이어야 합니다.' }, { status: 400 })
    }
    updatePayload.summary = body.summary.trim() || null
  }

  if (body.sections !== undefined) {
    if (!Array.isArray(body.sections)) {
      return NextResponse.json({ error: 'sections 는 배열이어야 합니다.' }, { status: 400 })
    }
    updatePayload.sections = body.sections
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: '변경할 내용이 없습니다.' }, { status: 400 })
  }

  const { data, error } = await auth.admin
    .from('competitor_weekly_reports')
    .update(updatePayload)
    .eq('id', id)
    .select('id, status, summary, sections')
    .maybeSingle()

  if (error) {
    if (isPgError(error) && error.code === '42P01') {
      return NextResponse.json({ error: '경쟁사 주간 브리핑 테이블이 아직 준비되지 않았습니다 (SQL 미적용).' }, { status: 503 })
    }
    if (isPgError(error) && error.code === '23514') {
      return NextResponse.json(
        { error: '보관 상태가 아직 지원되지 않습니다 — sql-handoff/369-cwr-archived-status.sql 미적용.' },
        { status: 503 },
      )
    }
    console.error('[PATCH /api/admin/competitor-weekly/[id]] 오류:', error)
    return NextResponse.json({ error: '수정 중 오류가 발생했습니다.' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: '해당 브리핑을 찾을 수 없습니다.' }, { status: 404 })

  return NextResponse.json({ ok: true, report: data })
}

/** DELETE /api/admin/competitor-weekly/[id] — 하드삭제(신규 SQL 없음, confirm 은 프런트에서). */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const auth = await verifyAdminRequest()
  if ('response' in auth) return auth.response

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 })

  const { error } = await auth.admin
    .from('competitor_weekly_reports')
    .delete()
    .eq('id', id)

  if (error) {
    if (isPgError(error) && error.code === '42P01') {
      return NextResponse.json({ error: '경쟁사 주간 브리핑 테이블이 아직 준비되지 않았습니다 (SQL 미적용).' }, { status: 503 })
    }
    console.error('[DELETE /api/admin/competitor-weekly/[id]] 오류:', error)
    return NextResponse.json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
