import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  // last_seen_at = now (컬럼 미적용 시 graceful)
  const { error } = await supabase
    .from('users')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error && error.code !== '42703') {
    console.error('[me/seen] 갱신 실패:', error.message)
  }

  return NextResponse.json({ ok: true })
}
