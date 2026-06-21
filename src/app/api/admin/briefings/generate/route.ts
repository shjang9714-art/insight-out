import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { generateBriefing } from '@/lib/briefing/generate-briefing'

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

export async function POST(req: Request) {
  try {
    const authError = await verifyAdmin()
    if (authError) return authError

    let force = false
    try {
      const body = await req.json()
      force = Boolean(body?.force)
    } catch {
      // body 없어도 허용
    }

    const result = await generateBriefing({ force })
    const status = result.ok ? 200 : 400
    return NextResponse.json(result, { status })
  } catch (err) {
    console.error('[/api/admin/briefings/generate] 오류:', err)
    return NextResponse.json(
      { error: '브리핑 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
