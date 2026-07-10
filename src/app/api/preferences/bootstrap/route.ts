import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sanitizeCategoryKeys } from '@/lib/feed/categories'

interface BootstrapBody {
  category_keys?: string[]
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  let body: BootstrapBody
  try {
    body = (await req.json()) as BootstrapBody
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const categoryKeys = Array.isArray(body.category_keys)
    ? sanitizeCategoryKeys(body.category_keys)
    : []

  if (categoryKeys.length < 1) {
    return NextResponse.json(
      { error: '카테고리를 최소 1개 선택해야 합니다.' },
      { status: 400 }
    )
  }

  // 선택 카테고리 저장 + 온보딩 완료(스킵 플래그 해제)
  const { error: updateError } = await supabase
    .from('users')
    .update({ feed_categories: categoryKeys, feed_onboarding_skipped: false })
    .eq('id', user.id)
  if (updateError) {
    console.error('[preferences/bootstrap] feed_categories 저장 오류:', updateError)
    return NextResponse.json({ error: '선호 저장에 실패했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
