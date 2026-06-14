import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { LLM_PROVIDERS, llmComplete } from '@/lib/llm'
import { createAdminClient } from '@/lib/supabase/admin'
import { getKstPeriod } from '@/lib/translate'

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
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })
  }

  return null
}

/**
 * GET /api/admin/llm-test
 * 어드민 전용 — 4개 provider isConfigured 현황 + llmComplete 1회 호출 결과 반환.
 * David 가 .env.local/Vercel 에 키 입력 후 이 라우트로 동작 확인.
 */
export async function GET() {
  const authError = await verifyAdmin()
  if (authError) return authError

  try {
    const admin = createAdminClient()
    const period = getKstPeriod()

    const [usageResult, settingsResult] = await Promise.all([
      admin.from('llm_usage').select('provider, tokens, calls').eq('period', period),
      admin.from('llm_settings').select('provider, enabled, monthly_token_limit'),
    ])

    const usage = new Map(
      (usageResult.data ?? []).map(r => [r.provider as string, r])
    )
    const settings = new Map(
      (settingsResult.data ?? []).map(r => [r.provider as string, r])
    )

    const providerStatus = LLM_PROVIDERS.map(p => {
      const u = usage.get(p.name)
      const s = settings.get(p.name)
      return {
        name: p.name,
        configured: p.isConfigured(),
        enabled: s?.enabled ?? true,
        monthly_token_limit: s?.monthly_token_limit ?? 1_000_000,
        tokens_used: u?.tokens ?? 0,
        calls_used: u?.calls ?? 0,
      }
    })

    // llmComplete 1회 호출 (어느 provider가 응답하는지 서버 로그로 확인)
    const SYSTEM = 'You are a JSON API. Reply with valid JSON only, no markdown.'
    const USER = 'Return {"ok":true} as JSON.'
    const text = await llmComplete(SYSTEM, USER)

    // 호출 후 사용량 재조회 — 응답한 provider 파악
    const { data: usageAfter } = await admin
      .from('llm_usage').select('provider, tokens, calls').eq('period', period)

    const usageAfterMap = new Map(
      (usageAfter ?? []).map(r => [r.provider as string, r])
    )

    const respondedProvider = LLM_PROVIDERS.find(p => {
      const before = usage.get(p.name)?.calls ?? 0
      const after = usageAfterMap.get(p.name)?.calls ?? 0
      return after > before
    })?.name ?? (text ? 'unknown' : null)

    return NextResponse.json({
      period,
      providers: providerStatus,
      test: {
        responded_provider: respondedProvider,
        text: text ? text.slice(0, 200) : null,
        ok: text !== null,
      },
    })
  } catch (err) {
    console.error('[/api/admin/llm-test] 오류:', err)
    return NextResponse.json(
      { error: 'LLM 테스트 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
