import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { suggestEntityNormalization } from '@/lib/entities/suggest-normalization'
import { LLM_PROVIDERS } from '@/lib/llm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

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
 * POST /api/admin/entities/suggest-normalization
 * LLM으로 중복 엔티티 병합 제안 생성 — 적용하지 않음(제안만)
 */
export async function POST(request: NextRequest) {
  const { error: authError } = await verifyAdmin()
  if (authError) return authError

  // LLM 키 체크
  const hasLlm = LLM_PROVIDERS.some(p => p.isConfigured())
  if (!hasLlm) {
    return NextResponse.json(
      { error: 'LLM 키가 설정되지 않아 제안을 생성할 수 없습니다.' },
      { status: 503 }
    )
  }

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const entityType = typeof body.entityType === 'string' && body.entityType ? body.entityType : undefined
    const limit = typeof body.limit === 'number' && body.limit > 0 ? body.limit : 150

    const admin = createAdminClient()
    const groups = await suggestEntityNormalization(admin, { entityType, limit })

    return NextResponse.json({ groups })
  } catch (err) {
    console.error('[POST /api/admin/entities/suggest-normalization] 오류:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
