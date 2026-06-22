import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getKstPeriod(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
}

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

/**
 * GET /api/admin/briefings
 * 어드민 전용 — 전체 브리핑 목록(draft 포함) + 이번 달 TTS 사용량 반환.
 */
export async function GET() {
  try {
    const authError = await verifyAdmin()
    if (authError) return authError

    const admin = createAdminClient()
    const period = getKstPeriod()
    // WaveNet 무료 한도 100만/월 → 보수적으로 90만. (synthesize-briefing.ts 기본값과 일치)
    const cap = Number(process.env.TTS_MONTHLY_CHAR_CAP ?? 900_000)

    const [briefingsResult, usageResult] = await Promise.all([
      admin
        .from('briefings')
        .select('id, briefing_date, title, script, audio_url, audio_duration_seconds, voice, status, generated_at, published_at, updated_at')
        .order('briefing_date', { ascending: false })
        .limit(60),
      admin
        .from('tts_usage')
        .select('chars')
        .eq('provider', 'google')
        .eq('period', period)
        .maybeSingle(),
    ])

    if (briefingsResult.error) throw briefingsResult.error

    const used = Number(usageResult.data?.chars ?? 0)

    return NextResponse.json({
      period,
      tts: { used, cap },
      briefings: briefingsResult.data ?? [],
    })
  } catch (err) {
    console.error('[GET /api/admin/briefings] 오류:', err)
    return NextResponse.json(
      { error: '브리핑 목록을 불러오지 못했습니다.' },
      { status: 500 }
    )
  }
}
