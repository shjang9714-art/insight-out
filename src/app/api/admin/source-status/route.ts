import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// verifyAdmin: crawl-now/route.ts 와 동일하게 복제 (공통 추출은 추후)
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

export interface SourceStatusInfo {
  inserted7d: number
  lastStatus: string | null
  lastFinishedAt: string | null
  consecutiveFailures: number
}

/**
 * GET /api/admin/source-status
 * 최근 7일 crawl_logs 를 source_id 별로 집계해 반환.
 * admin 인증 필수.
 */
export async function GET() {
  const authError = await verifyAdmin()
  if (authError) return authError

  try {
    const admin = createAdminClient()
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await admin
      .from('crawl_logs')
      .select('source_id, status, inserted_count, finished_at')
      .gte('started_at', sevenDaysAgo)
      .not('source_id', 'is', null)
      .order('finished_at', { ascending: false })  // 최신 먼저

    if (error) throw error

    type LogRow = { source_id: string; status: string; inserted_count: number; finished_at: string | null }

    const result: Record<string, SourceStatusInfo> = {}
    // 연속 실패 체인이 끊긴 소스 — 이후 failed 가 와도 consecutiveFailures 증가 안 함
    const chainBroken = new Set<string>()

    for (const row of (data ?? []) as LogRow[]) {
      const sid = row.source_id
      if (!sid) continue

      if (!result[sid]) {
        // 첫 등장 = 최신 로그 (finished_at desc 정렬)
        result[sid] = {
          inserted7d:          0,
          lastStatus:          row.status,
          lastFinishedAt:      row.finished_at,
          consecutiveFailures: 0,
        }
      }

      result[sid].inserted7d += row.inserted_count

      if (!chainBroken.has(sid)) {
        if (row.status === 'failed') {
          result[sid].consecutiveFailures++
        } else {
          // 성공/partial → 연속 실패 체인 끊김
          chainBroken.add(sid)
        }
      }
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/admin/source-status] 오류:', err)
    return NextResponse.json(
      { error: '소스 수집 상태를 불러오지 못했습니다.' },
      { status: 500 }
    )
  }
}
