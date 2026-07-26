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

function escapeHtmlAttr(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * 메일 게이트웨이(스팸/보안 스캐너)가 메일 본문 링크를 사람 클릭 없이 자동으로 GET
 * 프리페치하는 경우가 있어, GET에서 상태를 바꾸면 원치 않는 구독 해지가 발생한다.
 * 그래서 GET은 확인 페이지만 보여주고, 실제 해지는 사용자가 버튼을 눌러 발생하는
 * POST에서만 수행한다.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')

  if (!token) {
    return htmlResponse('<h2>잘못된 요청입니다.</h2><p>유효하지 않은 링크입니다.</p>', 400)
  }

  return htmlResponse(`
    <h2>구독을 해지하시겠어요?</h2>
    <p>Insight Out 뉴스레터 수신을 중단합니다.</p>
    <form method="POST" action="/api/newsletter/unsubscribe" style="margin-top:24px;">
      <input type="hidden" name="token" value="${escapeHtmlAttr(token)}" />
      <button type="submit" style="font-family:inherit;font-size:15px;padding:10px 24px;border-radius:8px;border:1px solid #d1d5db;background:#111827;color:#fff;cursor:pointer;">구독 해지</button>
    </form>
  `)
}

/**
 * 브라우저의 확인 폼 제출과, 메일 클라이언트의 RFC 8058 원클릭 해지
 * (List-Unsubscribe-Post: `List-Unsubscribe=One-Click`, token은 요청 URL 쿼리에 포함)를
 * 모두 처리한다. 두 경우 모두 token은 unsubscribe_token과 정확히 일치해야 한다.
 */
export async function POST(request: NextRequest) {
  let token = request.nextUrl.searchParams.get('token')

  if (!token) {
    const contentType = request.headers.get('content-type') ?? ''
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      try {
        const form = await request.formData()
        const fromForm = form.get('token')
        if (typeof fromForm === 'string' && fromForm) {
          token = fromForm
        }
      } catch {
        token = null
      }
    }
  }

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
