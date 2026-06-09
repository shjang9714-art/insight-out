import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'RESEND_WEBHOOK_SECRET 미설정' }, { status: 401 })
  }

  const body = await request.text()
  const headers = {
    'svix-id': request.headers.get('svix-id') ?? '',
    'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
    'svix-signature': request.headers.get('svix-signature') ?? '',
  }

  let payload: { type: string; data: { email_id: string; created_at?: string } }
  try {
    const wh = new Webhook(secret)
    payload = wh.verify(body, headers) as typeof payload
  } catch {
    return NextResponse.json({ error: '서명 검증 실패' }, { status: 401 })
  }

  const { type, data } = payload
  const messageId = data.email_id
  if (!messageId) return NextResponse.json({ ok: true })

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  if (type === 'email.delivered') {
    await db
      .from('newsletter_recipients')
      .update({ status: 'delivered', delivered_at: new Date().toISOString() })
      .eq('resend_message_id', messageId)
      .eq('status', 'sent')
  } else if (type === 'email.opened') {
    await db
      .from('newsletter_recipients')
      .update({ status: 'opened', opened_at: new Date().toISOString() })
      .eq('resend_message_id', messageId)
      .in('status', ['sent', 'delivered'])
  } else if (type === 'email.bounced') {
    await db
      .from('newsletter_recipients')
      .update({ status: 'bounced', error: '이메일 반송' })
      .eq('resend_message_id', messageId)
  } else if (type === 'email.complained') {
    console.warn('[resend-webhook] 수신 거부(complaint) | messageId=%s', messageId)
  } else {
    console.log('[resend-webhook] 미처리 이벤트 | type=%s | messageId=%s', type, messageId)
  }

  return NextResponse.json({ ok: true })
}
