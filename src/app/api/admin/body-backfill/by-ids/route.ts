import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse, type NextRequest } from 'next/server'
import { enrichByIds } from '@/lib/contents/enrich-body'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300


/**
 * POST /api/admin/body-backfill/by-ids
 * body: { ids: string[] }
 * 선택한 콘텐츠 ID의 풀본문을 채운다. body_fetched_at 무관, 최대 50건, 270초 타임박스.
 */
export async function POST(request: NextRequest) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  const body = await request.json() as { ids?: unknown }
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: 'ids가 필요합니다.' }, { status: 400 })
  }

  const admin = gate.admin
  const result = await enrichByIds(admin, body.ids as string[], {
    deadline: Date.now() + 270_000,
  })
  return NextResponse.json(result)
}
