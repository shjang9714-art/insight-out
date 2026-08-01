import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse, type NextRequest } from 'next/server'
import { validateFeedUrl } from '@/lib/sources/feed-validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15


export async function POST(request: NextRequest) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  let body: { url?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  if (typeof body.url !== 'string' || !body.url.trim()) {
    return NextResponse.json({ error: '검증할 RSS URL을 입력해주세요.' }, { status: 400 })
  }

  const result = await validateFeedUrl(body.url.trim(), 10_000)
  return NextResponse.json(result)
}
