import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { buildDailyBriefHtml, gatherDailyBrief } from '@/lib/ops/daily-brief'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function verifyAdmin(): Promise<Response | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    return Response.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })
  }
  return null
}

export async function GET(request: NextRequest) {
  const authError = await verifyAdmin()
  if (authError) return authError

  try {
    const fail = request.nextUrl.searchParams.get('fail')
    const forceUnavailableSection = fail === 'usage' || fail === 'sources'
      ? fail
      : undefined
    const brief = await gatherDailyBrief(
      createAdminClient(),
      new Date(),
      { forceUnavailableSection }
    )
    if (request.nextUrl.searchParams.get('format') === 'html') {
      return new Response(buildDailyBriefHtml(brief), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      })
    }
    return Response.json(brief, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('[/api/admin/ops-brief-preview] 오류:', error)
    return Response.json(
      { error: '운영리포트 프리뷰 생성에 실패했습니다.' },
      { status: 500 }
    )
  }
}
