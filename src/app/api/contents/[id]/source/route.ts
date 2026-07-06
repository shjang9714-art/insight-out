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

  let originalUrl: string | null = null
  let canonicalUrl: string | null = null

  const { data, error } = await supabase
    .from('contents')
    .select('id, original_url, canonical_url')
    .eq('id', id)
    .single()

  if (error?.code === '42703') {
    // canonical_url 컬럼 미적용(196 SQL 전) → 제외 재시도
    const fallback = await supabase
      .from('contents')
      .select('id, original_url')
      .eq('id', id)
      .single()
    originalUrl = (fallback.data as { original_url: string | null } | null)?.original_url ?? null
  } else {
    const row = data as { original_url: string | null; canonical_url: string | null } | null
    originalUrl = row?.original_url ?? null
    canonicalUrl = row?.canonical_url ?? null
  }

  if (!originalUrl) {
    // 원문 없음(업로드 리포트 등) → 상세로
    return NextResponse.redirect(detailUrl, 302)
  }

  // canonical(196) 이미 해소돼 있으면 재fetch·자가치유 스킵 — 즉시 원문으로
  if (canonicalUrl) {
    return NextResponse.redirect(canonicalUrl, 302)
  }

  // dead 백스톱: link_ok=false 확정 링크는 상세로(42703 graceful — 컬럼 없으면 null→통과)
  const { data: lh } = await supabase
    .from('contents')
    .select('link_ok')
    .eq('id', id)
    .single()
  if ((lh as { link_ok: boolean | null } | null)?.link_ok === false) {
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
