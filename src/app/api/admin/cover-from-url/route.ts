import { NextResponse, type NextRequest } from 'next/server'
import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { copyExternalImageToCover } from '@/lib/contents/cover-from-image'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/cover-from-url
 *
 * 관리자 전용 — 외부 이미지 URL(og:image 등)을 서버에서 fetch 해
 * report-covers 버킷으로 복사하고 contents.thumbnail_url 을 갱신한다.
 * 외부 URL을 그대로 저장(핫링크)하지 않기 위한 서버 복사 경로(216).
 *
 * body: { contentId: string, imageUrl: string }
 */
export async function POST(request: NextRequest) {
  // ─── 1. 인증 + 관리자 확인 ─────────────────────────────────────────────────

  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  // ─── 2. 요청 파싱 ─────────────────────────────────────────────────────────

  let body: { contentId?: string; imageUrl?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const { contentId, imageUrl } = body
  if (!contentId || !imageUrl) {
    return NextResponse.json({ error: '필수 파라미터가 없습니다.' }, { status: 400 })
  }

  try {
    new URL(imageUrl)
  } catch {
    return NextResponse.json({ error: '올바른 이미지 URL이 아닙니다.' }, { status: 400 })
  }

  // ─── 3. service_role 로 fetch→업로드→thumbnail_url 갱신(216·219 공유 헬퍼) ──

  const admin = gate.admin

  const thumbnailUrl = await copyExternalImageToCover(admin, contentId, imageUrl)
  if (!thumbnailUrl) {
    return NextResponse.json({ error: '이미지를 가져오지 못했습니다.' }, { status: 502 })
  }

  return NextResponse.json({ thumbnailUrl })
}
