import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const secret = process.env.BREVO_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'BREVO_WEBHOOK_SECRET 미설정' }, { status: 401 })
  }

  const provided = request.headers.get('x-webhook-token') ?? new URL(request.url).searchParams.get('token')
  if (provided !== secret) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 })
  }

  const raw = await request.json()
  const events = Array.isArray(raw) ? raw : [raw]

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  for (const ev of events) {
    const messageId = ev['message-id'] as string | undefined
    if (!messageId) continue

    const type = ev.event as string | undefined

    if (type === 'delivered') {
      await db
        .from('newsletter_recipients')
        .update({ status: 'delivered', delivered_at: new Date().toISOString() })
        .eq('message_id', messageId)
        .eq('status', 'sent')
    } else if (type === 'opened' || type === 'unique_opened') {
      await db
        .from('newsletter_recipients')
        .update({ status: 'opened', opened_at: new Date().toISOString() })
        .eq('message_id', messageId)
        .in('status', ['sent', 'delivered'])
    } else if (type === 'hard_bounce' || type === 'soft_bounce' || type === 'blocked' || type === 'invalid_email') {
      const reason = (ev.reason as string | undefined) ?? type
      console.warn('[brevo-webhook] 반송/차단 | messageId=%s | type=%s | reason=%s', messageId, type, reason)
      await db
        .from('newsletter_recipients')
        .update({ status: 'bounced', error: `이메일 반송(${type}): ${reason}` })
        .eq('message_id', messageId)
    } else if (type === 'spam') {
      console.warn('[brevo-webhook] 수신 거부(spam complaint) | messageId=%s', messageId)
    } else {
      console.log('[brevo-webhook] 미처리 이벤트 | type=%s | messageId=%s', type, messageId)
    }
  }

  return NextResponse.json({ ok: true })
}
