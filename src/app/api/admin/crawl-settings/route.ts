import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse } from 'next/server'
import { DEFAULT_MIN_BODY_LENGTH } from '@/lib/crawler/quality'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MIN_ALLOWED = 50
const MAX_ALLOWED = 5000


/**
 * GET /api/admin/crawl-settings
 * 현재 본문 최소 길이 설정. crawl_settings 미적용(42P01) 시 기본값 250 반환(graceful).
 */
export async function GET() {
  const gate = await verifyAdminRequest({ capability: 'manage_settings' })
  if (!gate.ok) return gate.response

  try {
    const admin = gate.admin
    const { data, error } = await admin
      .from('crawl_settings')
      .select('min_body_length')
      .eq('id', true)
      .maybeSingle()

    if (error) {
      console.warn('[/api/admin/crawl-settings] GET — SQL 221 미적용 가능, 기본값 반환:', error.message)
      return NextResponse.json({ min_body_length: DEFAULT_MIN_BODY_LENGTH, ready: false })
    }

    return NextResponse.json({
      min_body_length: data?.min_body_length ?? DEFAULT_MIN_BODY_LENGTH,
      ready: true,
    })
  } catch (err) {
    console.error('[/api/admin/crawl-settings] GET 오류:', err)
    return NextResponse.json({ min_body_length: DEFAULT_MIN_BODY_LENGTH, ready: false })
  }
}

/**
 * PATCH /api/admin/crawl-settings
 * body: { min_body_length: number } — 50~5000 범위.
 */
export async function PATCH(req: Request) {
  const gate = await verifyAdminRequest({ capability: 'manage_settings' })
  if (!gate.ok) return gate.response

  try {
    const body = await req.json() as { min_body_length?: number }
    const minBodyLength = body.min_body_length

    if (
      typeof minBodyLength !== 'number' ||
      !Number.isFinite(minBodyLength) ||
      minBodyLength < MIN_ALLOWED ||
      minBodyLength > MAX_ALLOWED
    ) {
      return NextResponse.json(
        { error: `min_body_length 는 ${MIN_ALLOWED}~${MAX_ALLOWED} 범위의 숫자여야 합니다.` },
        { status: 400 }
      )
    }

    const admin = gate.admin
    const { error } = await admin
      .from('crawl_settings')
      .upsert({ id: true, min_body_length: minBodyLength }, { onConflict: 'id' })

    if (error) {
      console.error('[/api/admin/crawl-settings] PATCH 오류:', error.message)
      return NextResponse.json({ error: `설정 저장에 실패했습니다: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ ok: true, min_body_length: minBodyLength })
  } catch (err) {
    console.error('[/api/admin/crawl-settings] PATCH 오류:', err)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
