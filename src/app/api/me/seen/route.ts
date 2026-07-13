import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { updateOwnProfile } from '@/lib/users/update-profile'

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

  try {
    await updateOwnProfile(user.id, { last_seen_at: new Date().toISOString() })
  } catch (error) {
    const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : null
    if (code !== '42703') console.error('[me/seen] 갱신 실패:', error)
  }

  return NextResponse.json({ ok: true })
}
