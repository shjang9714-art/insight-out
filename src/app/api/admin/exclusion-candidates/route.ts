import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ExclusionCandidate } from '@/lib/admin/exclusion-rules'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// verifyAdmin: exclusion-rules/route.ts 와 동일하게 복제 (공통 추출은 추후)
async function verifyAdmin(): Promise<{ email: string | null } | NextResponse> {
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

  return { email: user.email ?? null }
}

const RPC_MISSING_CODES = new Set(['42883', '42P01'])

function clampDays(raw: string | null): number {
  const n = Number(raw)
  return [7, 14, 30].includes(n) ? n : 30
}

function clampMin(raw: string | null): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 3
  return Math.min(50, Math.max(1, Math.floor(n)))
}

/**
 * GET /api/admin/exclusion-candidates?days=30&min=3
 * 최근 N일 검토대기·반려 반복 도메인 집계(195). RPC 미적용(42883/42P01) → graceful 빈 배열.
 */
export async function GET(req: NextRequest) {
  const authResult = await verifyAdmin()
  if (authResult instanceof NextResponse) return authResult

  const days = clampDays(req.nextUrl.searchParams.get('days'))
  const min = clampMin(req.nextUrl.searchParams.get('min'))

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('exclusion_candidates', {
      p_days: days,
      p_min_count: min,
    })

    if (error) {
      if (RPC_MISSING_CODES.has(error.code ?? '')) {
        return NextResponse.json({ candidates: [], ready: false })
      }
      console.warn('[/api/admin/exclusion-candidates GET] RPC 오류(graceful):', error.message)
      return NextResponse.json({ candidates: [], ready: false })
    }

    return NextResponse.json({ candidates: (data ?? []) as ExclusionCandidate[], ready: true })
  } catch (err) {
    console.error('[/api/admin/exclusion-candidates GET] 오류(graceful):', err)
    return NextResponse.json({ candidates: [], ready: false })
  }
}

/**
 * POST /api/admin/exclusion-candidates
 * { domain } → 무시(학습) 등록. 다시 제안하지 않도록 exclusion_candidate_ignores 에 upsert.
 * 테이블 미적용 시 graceful(200 + noop).
 */
export async function POST(req: NextRequest) {
  const authResult = await verifyAdmin()
  if (authResult instanceof NextResponse) return authResult

  const body = await req.json() as { domain?: string }
  const domain = body.domain?.trim().toLowerCase()
  if (!domain) {
    return NextResponse.json({ error: 'domain이 필요합니다.' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('exclusion_candidate_ignores')
      .upsert({ domain, created_by: authResult.email }, { onConflict: 'domain' })

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({ ok: true, ready: false })
      }
      throw error
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/admin/exclusion-candidates POST] 오류(graceful):', err)
    return NextResponse.json({ ok: true, ready: false })
  }
}
