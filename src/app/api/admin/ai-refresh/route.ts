import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

async function verifyAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })
  return null
}

/**
 * POST /api/admin/ai-refresh
 * 어드민 수동 트리거 — cron 로직을 어드민 인증으로 1회 실행.
 */
export async function POST(request: NextRequest) {
  const denied = await verifyAdmin()
  if (denied) return denied

  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET 미설정' }, { status: 500 })
  }

  // 같은 서버에서 cron 엔드포인트를 CRON_SECRET으로 호출
  const origin = request.nextUrl.origin
  const res = await fetch(`${origin}/api/cron/ai-refresh`, {
    headers: { Authorization: `Bearer ${cronSecret}` },
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
