import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { runCrawl } from '@/lib/crawler/orchestrator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/admin/crawl-now
 * 어드민 전용 — 활성 소스를 즉시 수집 (당일분, backfill 없음).
 * CRON_SECRET 불필요 (관리자 인증으로 대체).
 */
export async function POST() {
  try {
    // 관리자 확인
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookies) {
            cookies.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 403 }
      )
    }

    // 크롤링 실행 (당일분만, backfillDays 없음)
    const summary = await runCrawl({ force: true })

    return NextResponse.json(summary, { status: 200 })
  } catch (err) {
    console.error('[/api/admin/crawl-now] 오류:', err)
    return NextResponse.json(
      { error: '수집 준비 중 오류가 발생했습니다. 서버 설정을 확인해주세요.' },
      { status: 500 }
    )
  }
}
