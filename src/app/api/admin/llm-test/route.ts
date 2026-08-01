import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse } from 'next/server'
import { LLM_PROVIDERS, llmComplete } from '@/lib/llm'
import { getKstPeriod } from '@/lib/translate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'


/**
 * GET /api/admin/llm-test
 * 어드민 전용 — provider 현황 + 용도별 라우팅 + llmComplete('classify') 1회 호출 결과.
 */
export async function GET() {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  try {
    const admin = gate.admin
    const period = getKstPeriod()

    const [usageResult, settingsResult, routingResult] = await Promise.all([
      admin.from('llm_usage').select('provider, tokens, calls').eq('period', period),
      admin.from('llm_settings').select('provider, enabled, monthly_token_limit'),
      admin
        .from('llm_task_routing')
        .select('task_type, priority, provider, model_id, is_active')
        .order('task_type')
        .order('priority'),
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

    // llmComplete('classify') 1회 호출
    const SYSTEM = 'You are a JSON API. Reply with valid JSON only, no markdown.'
    const USER = 'Return {"ok":true} as JSON.'
    const text = await llmComplete('classify', SYSTEM, USER)

    // 호출 후 사용량 재조회 → 응답한 provider 판별
    const { data: usageAfter } = await admin
      .from('llm_usage').select('provider, tokens, calls').eq('period', period)

    const usageAfterMap = new Map(
      (usageAfter ?? []).map(r => [r.provider as string, r])
    )

    const respondedProvider = LLM_PROVIDERS.find(p => {
      const before = (usage.get(p.name)?.calls as number | undefined) ?? 0
      const after  = (usageAfterMap.get(p.name)?.calls as number | undefined) ?? 0
      return after > before
    })?.name ?? (text ? 'unknown' : null)

    // 응답한 provider의 라우팅에서 사용된 model_id 추론
    const usedRoute = (routingResult.data ?? []).find(
      r => r.task_type === 'classify' && r.provider === respondedProvider && r.is_active
    )

    return NextResponse.json({
      period,
      providers: providerStatus,
      routing: routingResult.data ?? [],
      test: {
        task: 'classify',
        responded_provider: respondedProvider,
        responded_model: usedRoute?.model_id ?? null,
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
