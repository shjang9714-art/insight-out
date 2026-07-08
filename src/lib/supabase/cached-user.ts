import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/** 요청 단위로 getUser() 를 메모이즈 — 홈 화면 섹션 5종의 중복 인증 왕복 제거(지시서 234). */
export const getCachedUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})
