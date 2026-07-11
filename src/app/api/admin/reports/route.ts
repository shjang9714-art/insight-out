import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function verifyAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) }
  }

  return { error: null }
}

/**
 * GET /api/admin/reports
 * 전략보고서 어드민 관리 목록(276) — 전체 상태(초안·생성중·완료·실패·발행) 조회.
 */
export async function GET() {
  const { error: authError } = await verifyAdmin()
  if (authError) return authError

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ai_reports')
    .select('id, title, type, status, topic, summary, cover_image_url, publisher, published_at, error_message, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[admin/reports] 목록 조회 실패:', error)
    return NextResponse.json({ error: '목록을 불러오지 못했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ reports: data ?? [] })
}
