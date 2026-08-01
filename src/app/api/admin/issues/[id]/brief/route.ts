import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse, type NextRequest } from 'next/server'
import { generateIssueBrief } from '@/lib/issues/brief'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60


/**
 * POST /api/admin/issues/[id]/brief
 * 이슈 AI 브리핑 생성 및 저장.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: '이슈 ID가 필요합니다.' }, { status: 400 })
  }

  const admin = gate.admin

  const result = await generateIssueBrief(admin, id)

  if (!result) {
    return NextResponse.json(
      { error: 'AI 브리핑 생성 실패 — LLM 키가 없거나 콘텐츠 부족.' },
      { status: 503 }
    )
  }

  const { brief, model } = result

  // brief 컬럼 저장 (SQL 미적용 시 조용히 무시)
  try {
    const { error: updateError } = await admin
      .from('issues')
      .update({
        brief,
        brief_generated_at: new Date().toISOString(),
        brief_model: model,
      })
      .eq('id', id)

    if (updateError) {
      // 42703 = undefined_column (SQL 미적용 graceful)
      if (updateError.code !== '42703') {
        console.error('[IssueBrief] DB 저장 실패:', updateError.message)
      }
    }
  } catch (err) {
    console.error('[IssueBrief] 저장 오류:', err instanceof Error ? err.message : String(err))
  }

  return NextResponse.json({ brief })
}
