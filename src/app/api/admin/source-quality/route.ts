import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// verifyAdmin: source-status/route.ts 와 동일하게 복제 (공통 추출은 추후)
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

const REVIEW_REASON_KEYS = [
  'body_missing',
  'body_short',
  'body_truncated',
  'extract_failed',
  'low_relevance',
  'llm_irrelevant',
] as const

interface RpcRow {
  source_id: string
  total: number
  published: number
  pending: number
  rejected: number
  body_full: number
  link_checked: number
  dead_links: number
  bookmarks: number
  r_body_missing: number
  r_body_short: number
  r_body_truncated: number
  r_extract_failed: number
  r_low_relevance: number
  r_llm_irrelevant: number
}

export interface SourceQualityStat {
  total: number
  published: number
  pending: number
  rejected: number
  bodyFull: number
  linkChecked: number
  deadLinks: number
  bookmarks: number
  publishRate: number
  pendingRate: number   // 검토 대기율 = 불량률
  bodyFullRate: number
  deadLinkRate: number
  topReason: string | null   // REVIEW_REASON_LABEL 키(178) — 최다 사유
}

function toStat(row: RpcRow): SourceQualityStat {
  const total = row.total ?? 0
  const reasonCounts: Record<string, number> = {
    body_missing:    row.r_body_missing ?? 0,
    body_short:      row.r_body_short ?? 0,
    body_truncated:  row.r_body_truncated ?? 0,
    extract_failed:  row.r_extract_failed ?? 0,
    low_relevance:   row.r_low_relevance ?? 0,
    llm_irrelevant:  row.r_llm_irrelevant ?? 0,
  }
  let topReason: string | null = null
  let topCount = 0
  for (const key of REVIEW_REASON_KEYS) {
    if (reasonCounts[key] > topCount) {
      topCount = reasonCounts[key]
      topReason = key
    }
  }

  return {
    total,
    published:    row.published ?? 0,
    pending:      row.pending ?? 0,
    rejected:     row.rejected ?? 0,
    bodyFull:     row.body_full ?? 0,
    linkChecked:  row.link_checked ?? 0,
    deadLinks:    row.dead_links ?? 0,
    bookmarks:    row.bookmarks ?? 0,
    publishRate:   total > 0 ? row.published / total : 0,
    pendingRate:   total > 0 ? row.pending / total : 0,
    bodyFullRate:  total > 0 ? row.body_full / total : 0,
    deadLinkRate:  row.link_checked > 0 ? row.dead_links / row.link_checked : 0,
    topReason,
  }
}

/** RPC 미적용 등으로 품질 지표를 계산할 수 없을 때의 신호(312) — UI 는 '—' 대신 이 사실을 드러내야 한다. */
export interface SourceQualityUnavailable {
  unavailable: true
  reason: 'rpc_missing' | 'error'
}

export type SourceQualityResponse = Record<string, SourceQualityStat> | SourceQualityUnavailable

/**
 * GET /api/admin/source-quality?days=7|14|30
 * RPC source_quality_stats(p_days) 호출 → source_id 별 품질 집계.
 * RPC 미적용(42883 등) 또는 오류 시 — console.error 를 남기고 { unavailable: true } 를 반환한다.
 * 312 이전에는 빈 객체({})를 조용히 반환해 "품질 지표가 전부 —"인 사고를 아무도 못 봤다.
 */
export async function GET(req: NextRequest) {
  const authError = await verifyAdmin()
  if (authError) return authError

  const daysParam = Number(req.nextUrl.searchParams.get('days') ?? '30')
  const pDays = [7, 14, 30].includes(daysParam) ? daysParam : 30

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('source_quality_stats', { p_days: pDays })

    if (error) {
      // RPC 미존재(42883 undefined_function) 등 — 화면에 드러나야 한다(조용히 삼키지 않는다).
      console.error('[/api/admin/source-quality] source_quality_stats RPC 호출 실패(186 SQL 미적용 가능):', error.message)
      const body: SourceQualityUnavailable = { unavailable: true, reason: 'rpc_missing' }
      return NextResponse.json(body)
    }

    const result: Record<string, SourceQualityStat> = {}
    for (const row of (data ?? []) as RpcRow[]) {
      if (row.source_id) result[row.source_id] = toStat(row)
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/admin/source-quality] 오류:', err)
    const body: SourceQualityUnavailable = { unavailable: true, reason: 'error' }
    return NextResponse.json(body)
  }
}
