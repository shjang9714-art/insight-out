import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { synthesizeBriefingAudio } from '@/lib/tts/synthesize-briefing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
 * POST /api/admin/briefings/[id]/tts
 * 어드민 전용 — 브리핑 script 를 Google Cloud TTS 로 합성 후 Storage 에 업로드.
 * #49 어드민 "오디오 생성/재생성" 버튼의 호출 대상.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await verifyAdmin()
    if (authError) return authError

    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: '브리핑 ID가 필요합니다.' }, { status: 400 })
    }

    const result = await synthesizeBriefingAudio(id)

    if (!result.ok) {
      const status =
        result.reason === '월 한도 초과' ? 409 :
        result.reason === '스크립트 없음' ? 400 :
        result.reason.includes('찾을 수 없') ? 404 :
        500
      return NextResponse.json({ ok: false, reason: result.reason }, { status })
    }

    return NextResponse.json({ ok: true, audioUrl: result.audioUrl }, { status: 200 })
  } catch (err) {
    console.error('[/api/admin/briefings/[id]/tts] 오류:', err)
    return NextResponse.json(
      { error: 'TTS 처리 중 오류가 발생했습니다. 서버 설정을 확인해주세요.' },
      { status: 500 }
    )
  }
}
