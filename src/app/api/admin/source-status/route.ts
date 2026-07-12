import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import type { RejectedBy } from '@/lib/crawler/types'

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
  /** 마지막으로 성공/부분성공(failed 아님)한 실행 시각(312) — "고장" 판정(연속실패 또는 장기 무성공)에 사용. */
  lastSuccessAt: string | null
  consecutiveFailures: number
  lastError: string | null
  /** 이하 4개는 312 SQL(rejected_count/rejected_by) 미적용 시 0/null 로 graceful. */
  fetched7d: number
  duplicate7d: number
  rejected7d: number
  /** rejected_by 7일 합계 중 가장 큰 사유 키(ad/excludedGroup/tooShort/bodyTooShort/excludeRule). */
  topRejectReason: keyof RejectedBy | null
}

type LogRow = {
  source_id: string
  status: string
  inserted_count: number
  duplicate_count: number | null
  fetched_count: number | null
  rejected_count: number | null
  rejected_by: RejectedBy | null
  finished_at: string | null
  error_message: string | null
}

const REJECT_REASON_KEYS: (keyof RejectedBy)[] = ['ad', 'excludedGroup', 'tooShort', 'bodyTooShort', 'excludeRule']

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

    let { data, error } = await admin
      .from('crawl_logs')
      .select('source_id, status, inserted_count, duplicate_count, fetched_count, rejected_count, rejected_by, finished_at, error_message')
      .gte('started_at', sevenDaysAgo)
      .not('source_id', 'is', null)
      .order('finished_at', { ascending: false })  // 최신 먼저

    // 312 SQL(rejected_count/rejected_by) 미적용 시 undefined_column — 해당 컬럼 없이 재조회.
    if (error?.code === '42703') {
      console.error('[/api/admin/source-status] crawl_logs.rejected_count/rejected_by 컬럼 미적용(312 SQL 미실행) — 해당 컬럼 없이 조회:', error.message)
      const retry = await admin
        .from('crawl_logs')
        .select('source_id, status, inserted_count, duplicate_count, fetched_count, finished_at, error_message')
        .gte('started_at', sevenDaysAgo)
        .not('source_id', 'is', null)
        .order('finished_at', { ascending: false })
      data = (retry.data ?? []).map((r) => ({ ...r, rejected_count: null, rejected_by: null })) as typeof data
      error = retry.error
    }

    if (error) throw error

    const result: Record<string, SourceStatusInfo> = {}
    const rejectedByTotals: Record<string, RejectedBy> = {}
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
          lastSuccessAt:       null,
          consecutiveFailures: 0,
          lastError:           row.error_message ?? null,
          fetched7d:           0,
          duplicate7d:         0,
          rejected7d:          0,
          topRejectReason:     null,
        }
        rejectedByTotals[sid] = { ad: 0, excludedGroup: 0, tooShort: 0, bodyTooShort: 0, excludeRule: 0 }
      }

      result[sid].inserted7d += row.inserted_count
      result[sid].fetched7d += row.fetched_count ?? 0
      result[sid].duplicate7d += row.duplicate_count ?? 0
      result[sid].rejected7d += row.rejected_count ?? 0
      if (row.rejected_by) {
        for (const key of REJECT_REASON_KEYS) {
          rejectedByTotals[sid][key] += row.rejected_by[key] ?? 0
        }
      }

      if (!chainBroken.has(sid)) {
        if (row.status === 'failed') {
          result[sid].consecutiveFailures++
        } else {
          // 성공/partial → 연속 실패 체인 끊김. 이 시점(desc 정렬 첫 non-failed)이 마지막 성공.
          chainBroken.add(sid)
          result[sid].lastSuccessAt = row.finished_at
        }
      }
    }

    for (const sid of Object.keys(result)) {
      const totals = rejectedByTotals[sid]
      let topReason: keyof RejectedBy | null = null
      let topCount = 0
      for (const key of REJECT_REASON_KEYS) {
        if (totals[key] > topCount) {
          topCount = totals[key]
          topReason = key
        }
      }
      result[sid].topRejectReason = topReason
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
