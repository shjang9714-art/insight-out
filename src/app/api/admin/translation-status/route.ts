import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

async function verifyAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: '로그인이 필요합니다.' },
      { status: 401 }
    )
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json(
      { error: '관리자 권한이 필요합니다.' },
      { status: 403 }
    )
  }

  return null
}

export async function GET() {
  const authError = await verifyAdmin()
  if (authError) return authError

  try {
    const admin = createAdminClient()
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
  const authError = await verifyAdmin()
  if (authError) return authError

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
    const admin = createAdminClient()
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
