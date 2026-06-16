import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { error } = await supabase
    .from('users')
    .update({ feed_onboarding_skipped: true })
    .eq('id', user.id)

  if (error) {
    console.error('[preferences/skip] feed_onboarding_skipped 갱신 오류:', error)
    return NextResponse.json({ error: '건너뛰기 처리에 실패했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
