import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextRequest, NextResponse } from 'next/server'


/**
 * POST /api/admin/ai-refresh
 * 어드민 수동 트리거 — cron 로직을 어드민 인증으로 1회 실행.
 */
export async function POST(request: NextRequest) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET 미설정' }, { status: 500 })
  }

  // 같은 서버에서 cron 엔드포인트를 CRON_SECRET으로 호출
  const origin = request.nextUrl.origin
  const res = await fetch(`${origin}/api/cron/ai-refresh`, {
    headers: { Authorization: `Bearer ${cronSecret}` },
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
