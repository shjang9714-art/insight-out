import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse, type NextRequest } from 'next/server'
import {
  getKstPeriod,
  TRANSLATION_PROVIDERS,
} from '@/lib/translate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ProviderName = 'deepl' | 'papago' | 'google'

const PROVIDER_NAMES = new Set<ProviderName>([
  'deepl',
  'papago',
  'google',
])


export async function GET() {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  try {
    const admin = gate.admin
    const period = getKstPeriod()
    const [usageResult, settingsResult] = await Promise.all([
      admin
        .from('translation_usage')
        .select('provider, chars')
        .eq('period', period),
      admin
        .from('translation_settings')
        .select('provider, enabled'),
    ])

    if (usageResult.error) {
      console.error(
        '[api/admin/translation-status] 사용량 조회 실패:',
        usageResult.error.message
      )
      return NextResponse.json(
        { error: '번역 사용량을 불러오지 못했습니다.' },
        { status: 500 }
      )
    }

    if (settingsResult.error) {
      console.error(
        '[api/admin/translation-status] 설정 조회 실패:',
        settingsResult.error.message
      )
      return NextResponse.json(
        { error: '번역 설정을 불러오지 못했습니다.' },
        { status: 500 }
      )
    }

    const usage = new Map<string, number>(
      (usageResult.data ?? []).map((row) => [
        String(row.provider),
        Number(row.chars) || 0,
      ])
    )
    const settings = new Map<string, boolean>(
      (settingsResult.data ?? []).map((row) => [
        String(row.provider),
        Boolean(row.enabled),
      ])
    )

    const providers = TRANSLATION_PROVIDERS.map((provider) => {
      const used = usage.get(provider.name) ?? 0
      const limit = provider.monthlyCharLimit

      return {
        name: provider.name,
        configured: provider.isConfigured(),
        enabled: settings.get(provider.name) ?? true,
        used,
        limit,
        remaining: Math.max(limit - used, 0),
      }
    })

    return NextResponse.json({ period, providers })
  } catch (error) {
    console.error('[api/admin/translation-status] 상태 조회 실패:', error)
    return NextResponse.json(
      { error: '번역 상태를 불러오지 못했습니다.' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  let body: { provider?: unknown; enabled?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: '요청 형식이 올바르지 않습니다.' },
      { status: 400 }
    )
  }

  if (
    typeof body.provider !== 'string' ||
    !PROVIDER_NAMES.has(body.provider as ProviderName) ||
    typeof body.enabled !== 'boolean'
  ) {
    return NextResponse.json(
      { error: '공급자와 활성 상태를 확인해주세요.' },
      { status: 400 }
    )
  }

  try {
    const admin = gate.admin
    const { error } = await admin
      .from('translation_settings')
      .upsert(
        {
          provider: body.provider,
          enabled: body.enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'provider' }
      )

    if (error) {
      console.error(
        '[api/admin/translation-status] 설정 저장 실패:',
        error.message
      )
      return NextResponse.json(
        { error: '번역 설정을 저장하지 못했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      provider: body.provider,
      enabled: body.enabled,
    })
  } catch (error) {
    console.error('[api/admin/translation-status] 설정 저장 실패:', error)
    return NextResponse.json(
      { error: '번역 설정을 저장하지 못했습니다.' },
      { status: 500 }
    )
  }
}
