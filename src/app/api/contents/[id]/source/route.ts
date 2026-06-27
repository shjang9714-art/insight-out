import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveArticleUrl } from '@/lib/crawler/resolve-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const detailUrl = new URL(`/dashboard/contents/${id}`, request.url)

  // 로그인 사용자 세션(RLS) — 콘텐츠 가시성 검증
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data } = await supabase
    .from('contents')
    .select('id, original_url')
    .eq('id', id)
    .single()

  const originalUrl = (data as { original_url: string | null } | null)?.original_url
  if (!originalUrl) {
    // 원문 없음(업로드 리포트 등) → 상세로
    return NextResponse.redirect(detailUrl, 302)
  }

  // 해소 (google 리다이렉트만 실제 fetch, 그 외 즉시 반환)
  const resolved = await resolveArticleUrl(originalUrl)

  // 자가치유: 해소돼 바뀌었으면 DB에 덮어써 다음 클릭은 fetch 없이 즉시
  if (resolved !== originalUrl) {
    try {
      await createAdminClient()
        .from('contents')
        .update({ original_url: resolved })
        .eq('id', id)
    } catch { /* 캐시 실패 무시 — 리다이렉트는 진행 */ }
  }

  return NextResponse.redirect(resolved, 302)
}
