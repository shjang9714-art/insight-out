// COUNCIL 서버키 프록시 로그인 티켓 발급 (지시서 363)
//
// 로그인한 insight-out 사용자가 키 입력 없이 COUNCIL 토론(서버 등록 키)을 쓰도록,
// COUNCIL 프록시 /api/ai/* 가 검증하는 HMAC 티켓을 발급한다.
// 계약: ticket = base64url(payloadJSON) + "." + base64url(HMAC_SHA256(base64url(payloadJSON), SECRET))
//       payload = { sub, aud:'council', iat, exp }
// SECRET(COUNCIL_GATE_SECRET)은 insight-out·council 양쪽에 동일하게 설정된 서버 전용 값.

import { NextResponse } from 'next/server'
import { createHmac } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const TTL_SECONDS = 600

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf.toString('base64url')
}

function mintTicket(userId: string, secret: string): string {
  const now = Math.floor(Date.now() / 1000)
  const payload = { sub: userId, aud: 'council', iat: now, exp: now + TTL_SECONDS }
  const encodedPayload = base64url(JSON.stringify(payload))
  const signature = base64url(createHmac('sha256', secret).update(encodedPayload).digest())
  return `${encodedPayload}.${signature}`
}

export async function GET() {
  const secret = process.env.COUNCIL_GATE_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'COUNCIL_GATE_SECRET 이 설정되지 않았습니다.' },
      { status: 501 },
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })
  }

  const ticket = mintTicket(user.id, secret)
  return NextResponse.json({ ticket, ttl: TTL_SECONDS })
}
