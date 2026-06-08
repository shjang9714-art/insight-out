import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function htmlResponse(body: string, status = 200) {
  return new Response(
    `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>구독 해지 — Insight Out</title></head><body style="font-family:sans-serif;text-align:center;padding:60px 20px;color:#374151;">${body}</body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')

  if (!token) {
    return htmlResponse('<h2>잘못된 요청입니다.</h2><p>유효하지 않은 링크입니다.</p>', 400)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase
    .from('newsletter_subscriptions')
    .update({ is_active: false })
    .eq('unsubscribe_token', token)
    .select('user_id')
    .single()

  if (error || !data) {
    return htmlResponse('<h2>링크를 찾을 수 없습니다.</h2><p>이미 해지되었거나 유효하지 않은 링크입니다.</p>', 404)
  }

  return htmlResponse('<h2>구독이 해지되었습니다.</h2><p>더 이상 Insight Out 뉴스레터를 받지 않으실 것입니다.</p><p style="margin-top:24px;font-size:13px;color:#9ca3af;">마이페이지에서 언제든 다시 구독하실 수 있습니다.</p>')
}
