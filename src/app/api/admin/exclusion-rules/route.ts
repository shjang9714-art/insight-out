import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextRequest, NextResponse } from 'next/server'
import { EXCLUSION_RULE_TYPES, EXCLUSION_ACTIONS, type ExclusionRuleRow } from '@/lib/admin/exclusion-rules'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// verifyAdmin: requests/route.ts 와 동일하게 복제 (공통 추출은 추후)

const TABLE_MISSING_CODE = '42P01'

/**
 * GET /api/admin/exclusion-rules
 * 전체 규칙 목록. 테이블 미적용(42P01) → graceful 빈 목록.
 */
export async function GET() {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  try {
    const admin = gate.admin
    const { data, error } = await admin
      .from('exclusion_rules')
      .select('*')
      .order('hit_count', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      if (error.code === TABLE_MISSING_CODE) {
        return NextResponse.json({ items: [], tableReady: false })
      }
      throw error
    }

    return NextResponse.json({ items: (data ?? []) as ExclusionRuleRow[], tableReady: true })
  } catch (err) {
    console.error('[/api/admin/exclusion-rules GET] 오류(graceful):', err)
    return NextResponse.json({ items: [], tableReady: false })
  }
}

/**
 * POST /api/admin/exclusion-rules
 * 신규 규칙 생성. { rule_type, value, action?, note?, created_by? }
 */
export async function POST(req: NextRequest) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  const body = await req.json() as Partial<ExclusionRuleRow>
  const value = body.value?.trim()
  if (!value) {
    return NextResponse.json({ error: '값(도메인/URL/제목 패턴)을 입력해주세요.' }, { status: 400 })
  }
  if (!body.rule_type || !EXCLUSION_RULE_TYPES.includes(body.rule_type)) {
    return NextResponse.json({ error: `rule_type 은 ${EXCLUSION_RULE_TYPES.join(', ')} 중 하나여야 합니다.` }, { status: 400 })
  }
  const action = body.action && EXCLUSION_ACTIONS.includes(body.action) ? body.action : 'reject'

  const payload = {
    rule_type:  body.rule_type,
    value,
    action,
    is_active:  body.is_active ?? true,
    note:       body.note?.trim() || null,
    created_by: body.created_by?.trim() || null,
  }

  try {
    const admin = gate.admin
    const { data, error } = await admin
      .from('exclusion_rules')
      .insert(payload)
      .select('*')
      .single()

    if (error) {
      if (error.code === TABLE_MISSING_CODE) {
        return NextResponse.json(
          { error: 'exclusion_rules 테이블이 아직 적용되지 않았습니다.', tableReady: false },
          { status: 503 }
        )
      }
      if (error.code === '23505') {
        return NextResponse.json({ error: '이미 등록된 규칙입니다(종류+값 중복).' }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json({ item: data as ExclusionRuleRow })
  } catch (err) {
    console.error('[/api/admin/exclusion-rules POST] 오류:', err)
    return NextResponse.json({ error: '생성에 실패했습니다.' }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/exclusion-rules
 * 부분 수정. body.id 필수.
 */
export async function PATCH(req: NextRequest) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  const body = await req.json() as Partial<ExclusionRuleRow> & { id?: string }
  const { id, ...rest } = body
  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
  }

  const allowedFields: (keyof ExclusionRuleRow)[] = ['rule_type', 'value', 'action', 'is_active', 'note']
  const updatePayload: Record<string, unknown> = {}
  for (const key of allowedFields) {
    if (key in rest) updatePayload[key] = rest[key as keyof typeof rest]
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: '수정할 필드가 없습니다.' }, { status: 400 })
  }

  try {
    const admin = gate.admin
    const { data, error } = await admin
      .from('exclusion_rules')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      if (error.code === TABLE_MISSING_CODE) {
        return NextResponse.json(
          { error: 'exclusion_rules 테이블이 아직 적용되지 않았습니다.', tableReady: false },
          { status: 503 }
        )
      }
      throw error
    }

    return NextResponse.json({ item: data as ExclusionRuleRow })
  } catch (err) {
    console.error('[/api/admin/exclusion-rules PATCH] 오류:', err)
    return NextResponse.json({ error: '수정에 실패했습니다.' }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/exclusion-rules?id=<uuid>
 */
export async function DELETE(req: NextRequest) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
  }

  try {
    const admin = gate.admin
    const { error } = await admin.from('exclusion_rules').delete().eq('id', id)

    if (error) {
      if (error.code === TABLE_MISSING_CODE) {
        return NextResponse.json(
          { error: 'exclusion_rules 테이블이 아직 적용되지 않았습니다.', tableReady: false },
          { status: 503 }
        )
      }
      throw error
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/admin/exclusion-rules DELETE] 오류:', err)
    return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 })
  }
}
