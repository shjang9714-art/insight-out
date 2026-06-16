import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MIN_ONBOARDING_KEYWORDS, MAX_ONBOARDING_KEYWORDS } from '@/lib/preferences'

interface BootstrapBody {
  service_id?: string
  keyword_ids?: string[]
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

  const serviceId = body.service_id
  const keywordIds = Array.isArray(body.keyword_ids) ? [...new Set(body.keyword_ids)] : []

  if (!serviceId) {
    return NextResponse.json({ error: 'service_id 가 필요합니다.' }, { status: 400 })
  }
  if (keywordIds.length < MIN_ONBOARDING_KEYWORDS || keywordIds.length > MAX_ONBOARDING_KEYWORDS) {
    return NextResponse.json(
      { error: `키워드는 ${MIN_ONBOARDING_KEYWORDS}~${MAX_ONBOARDING_KEYWORDS}개 선택해야 합니다.` },
      { status: 400 }
    )
  }

  // ── user_preferences: 기존 onboarding 출처 선호를 새 선택으로 교체 ──────────
  const { error: deleteError } = await supabase
    .from('user_preferences')
    .delete()
    .eq('user_id', user.id)
    .eq('source', 'onboarding')
  if (deleteError) {
    console.error('[preferences/bootstrap] user_preferences 삭제 오류:', deleteError)
    return NextResponse.json({ error: '선호 저장에 실패했습니다.' }, { status: 500 })
  }

  const preferenceRows = keywordIds.map((keywordId) => ({
    user_id: user.id,
    keyword_id: keywordId,
    weight: 1.0,
    source: 'onboarding' as const,
  }))
  const { error: insertError } = await supabase.from('user_preferences').insert(preferenceRows)
  if (insertError) {
    console.error('[preferences/bootstrap] user_preferences 저장 오류:', insertError)
    return NextResponse.json({ error: '선호 저장에 실패했습니다.' }, { status: 500 })
  }

  // ── user_service_prefs: 추천 가중치용 별도 테이블 (user_services 와 분리) ──
  const { error: serviceUpsertError } = await supabase
    .from('user_service_prefs')
    .upsert(
      { user_id: user.id, service_id: serviceId, weight: 1.0, source: 'onboarding' },
      { onConflict: 'user_id,service_id' }
    )
  if (serviceUpsertError) {
    console.error('[preferences/bootstrap] user_service_prefs 저장 오류:', serviceUpsertError)
    return NextResponse.json({ error: '선호 저장에 실패했습니다.' }, { status: 500 })
  }

  // 키워드 선택 완료 = 온보딩 완료 의사 표시 → 스킵 플래그 해제
  const { error: skipResetError } = await supabase
    .from('users')
    .update({ feed_onboarding_skipped: false })
    .eq('id', user.id)
  if (skipResetError) {
    console.error('[preferences/bootstrap] feed_onboarding_skipped 해제 오류:', skipResetError)
  }

  return NextResponse.json({ ok: true })
}
