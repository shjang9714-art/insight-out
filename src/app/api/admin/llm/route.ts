import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { LLM_PROVIDERS } from '@/lib/llm'
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
 * GET /api/admin/llm
 * provider 현황 + 이번 달 사용량 + 라우팅 + 모델 카탈로그.
 * LLM 호출 없음 — DB 조회만.
 */
export async function GET() {
  const authError = await verifyAdmin()
  if (authError) return authError

  try {
    const admin = createAdminClient()
    const period = getKstPeriod()

    const [usageRes, settingsRes, routingRes, modelsRes] = await Promise.all([
      admin.from('llm_usage').select('provider, tokens, calls').eq('period', period),
      admin.from('llm_settings').select('provider, enabled, monthly_token_limit'),
      admin
        .from('llm_task_routing')
        .select('task_type, priority, provider, model_id, is_active')
        .order('task_type')
        .order('priority'),
      admin.from('llm_models').select('provider, model_id, label, is_active'),
    ])

    const usageMap = new Map(
      (usageRes.data ?? []).map(r => [r.provider as string, r])
    )
    const settingsMap = new Map(
      (settingsRes.data ?? []).map(r => [r.provider as string, r])
    )

    const providers = LLM_PROVIDERS.map(p => {
      const u = usageMap.get(p.name)
      const s = settingsMap.get(p.name)
      return {
        name: p.name,
        configured: p.isConfigured(),
        enabled: s?.enabled ?? true,
        monthly_token_limit: s?.monthly_token_limit ?? 1_000_000,
        tokens_used: u?.tokens ?? 0,
        calls_used: u?.calls ?? 0,
      }
    })

    return NextResponse.json({
      period,
      providers,
      routing: routingRes.data ?? [],
      models: modelsRes.data ?? [],
    })
  } catch (err) {
    console.error('[/api/admin/llm] GET 오류:', err)
    return NextResponse.json({ error: '조회 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/llm
 * body: { provider, enabled?, monthly_token_limit? }
 * llm_settings 업데이트 — 키 값은 다루지 않음.
 */
export async function PATCH(req: Request) {
  const authError = await verifyAdmin()
  if (authError) return authError

  try {
    const body = await req.json() as {
      provider?: string
      enabled?: boolean
      monthly_token_limit?: number
    }

    if (!body.provider) {
      return NextResponse.json({ error: 'provider 필드가 필요합니다.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const upsertData: Record<string, unknown> = { provider: body.provider }
    if (body.enabled !== undefined)              upsertData.enabled = body.enabled
    if (body.monthly_token_limit !== undefined)  upsertData.monthly_token_limit = body.monthly_token_limit

    const { error } = await admin
      .from('llm_settings')
      .upsert(upsertData, { onConflict: 'provider' })

    if (error) {
      console.error('[/api/admin/llm] PATCH 오류:', error.message)
      return NextResponse.json({ error: '설정 업데이트에 실패했습니다.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/admin/llm] PATCH 오류:', err)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
