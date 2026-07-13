import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { PROFILE_COOKIE_NAME } from '@/lib/profile-cache-cookie'

export const dynamic = 'force-dynamic'

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

export async function GET() {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { data, error } = await supabase
    .from('users')
    .select('has_password')
    .eq('id', user.id)
    .single()

  if (error?.code === '42703') {
    return NextResponse.json({ hasPassword: false, ready: false })
  }
  if (error) {
    console.error('[me/has-password] 조회 실패:', error.message)
    return NextResponse.json({ error: '비밀번호 상태를 확인하지 못했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ hasPassword: data?.has_password === true, ready: true })
}

export async function DELETE() {
  const { user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const cookieStore = await cookies()
  cookieStore.delete(PROFILE_COOKIE_NAME)
  return NextResponse.json({ ok: true })
}
