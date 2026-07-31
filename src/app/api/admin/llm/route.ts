import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { LLM_PROVIDERS } from '@/lib/llm'
import { getProviderKeyCount } from '@/lib/llm/provider-key-count'
import {
  DEFAULT_MONTHLY_TOKEN_LIMIT,
  effectiveTokenLimit,
} from '@/lib/llm/token-limit'
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
      const keyCount = getProviderKeyCount(p)
      const monthlyTokenLimit = s?.monthly_token_limit ?? DEFAULT_MONTHLY_TOKEN_LIMIT
      return {
        name: p.name,
        configured: p.isConfigured(),
        enabled: s?.enabled ?? true,
        monthly_token_limit: monthlyTokenLimit,
        keyCount,
        effectiveTokenLimit: effectiveTokenLimit(monthlyTokenLimit, keyCount),
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
      task_type?: string
      priority?: number
      model_id?: string
      is_active?: boolean
    }

    const admin = createAdminClient()

    if (body.task_type !== undefined) {
      // 1·2·3순위 슬롯을 허용한다 — 검색은 우선순위 순회로 다중화(482).
      if (
        body.task_type !== 'search'
        || ![1, 2, 3].includes(body.priority as number)
        || body.is_active === undefined
      ) {
        return NextResponse.json(
          { error: '검색 AI 답변 설정값이 올바르지 않습니다.' },
          { status: 400 }
        )
      }

      // 슬롯 비우기: provider가 빈 값이면 해당 (task_type='search', priority=N) 행을 삭제한다.
      if (!body.provider) {
        const { error: deleteError } = await admin
          .from('llm_task_routing')
          .delete()
          .eq('task_type', 'search')
          .eq('priority', body.priority)

        if (deleteError) {
          console.error('[/api/admin/llm] 검색 라우팅 삭제 오류:', deleteError.message)
          return NextResponse.json({ error: '검색 AI 답변 설정 삭제에 실패했습니다.' }, { status: 500 })
        }

        return NextResponse.json({ ok: true, routing: null })
      }

      if (!body.model_id) {
        return NextResponse.json(
          { error: '검색 AI 답변 설정값이 올바르지 않습니다.' },
          { status: 400 }
        )
      }

      if (body.is_active) {
        const { data: model, error: modelError } = await admin
          .from('llm_models')
          .select('model_id')
          .eq('provider', body.provider)
          .eq('model_id', body.model_id)
          .eq('is_active', true)
          .maybeSingle()

        if (modelError) {
          console.error('[/api/admin/llm] 검색 모델 확인 오류:', modelError.message)
          return NextResponse.json({ error: '모델 확인에 실패했습니다.' }, { status: 500 })
        }
        if (!model) {
          return NextResponse.json(
            { error: '활성 모델 목록에 없는 provider·model 조합입니다.' },
            { status: 400 }
          )
        }
      }

      const { data, error } = await admin
        .from('llm_task_routing')
        .upsert({
          task_type: 'search',
          priority: body.priority,
          provider: body.provider,
          model_id: body.model_id,
          is_active: body.is_active,
        }, { onConflict: 'task_type,priority' })
        .select('task_type, priority, provider, model_id, is_active')
        .single()

      if (error) {
        console.error('[/api/admin/llm] 검색 라우팅 PATCH 오류:', error.message)
        return NextResponse.json({ error: '검색 AI 답변 설정 저장에 실패했습니다.' }, { status: 500 })
      }

      return NextResponse.json({ ok: true, routing: data })
    }

    if (!body.provider) {
      return NextResponse.json({ error: 'provider 필드가 필요합니다.' }, { status: 400 })
    }

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
