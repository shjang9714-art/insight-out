import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const RETENTION_DAYS = 90

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
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })
  }

  return null
}

function cutoffIso(): string {
  const d = new Date()
  d.setDate(d.getDate() - RETENTION_DAYS)
  return d.toISOString()
}

/** GET — 정리 대상(90일 초과) 건수 미리보기 */
export async function GET() {
  try {
    const authError = await verifyAdmin()
    if (authError) return authError

    const admin = createAdminClient()
    const { count, error } = await admin
      .from('job_runs')
      .select('id', { count: 'exact', head: true })
      .lt('started_at', cutoffIso())

    if (error) {
      if (error.code === '42P01') return NextResponse.json({ count: 0 })
      throw error
    }
    return NextResponse.json({ count: count ?? 0 })
  } catch (err) {
    console.error('[/api/admin/job-runs/cleanup] GET 오류:', err)
    return NextResponse.json({ error: '건수 조회 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

/** POST — 90일 초과 job_runs 삭제(292). 최근 이력은 보존. */
export async function POST() {
  try {
    const authError = await verifyAdmin()
    if (authError) return authError

    const admin = createAdminClient()
    const { error, count } = await admin
      .from('job_runs')
      .delete({ count: 'exact' })
      .lt('started_at', cutoffIso())

    if (error) {
      if (error.code === '42P01') return NextResponse.json({ deleted: 0 })
      throw error
    }
    return NextResponse.json({ deleted: count ?? 0 })
  } catch (err) {
    console.error('[/api/admin/job-runs/cleanup] POST 오류:', err)
    return NextResponse.json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
