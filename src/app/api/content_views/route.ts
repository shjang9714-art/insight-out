import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface ContentViewBody {
  content_id?: string
  dwell_seconds?: number
}

interface ContentViewPatchBody {
  id?: string
  dwell_seconds?: number
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  let body: ContentViewBody
  try {
    body = (await req.json()) as ContentViewBody
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  if (!body.content_id) {
    return NextResponse.json({ error: 'content_id 가 필요합니다.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('content_views')
    .insert({
      user_id: user.id,
      content_id: body.content_id,
      dwell_seconds: body.dwell_seconds ?? 0,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[content_views] 생성 오류:', error)
    return NextResponse.json({ error: '열람 기록 저장에 실패했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id })
}

/** 페이지 이탈 시 dwell_seconds 갱신. body: { id, dwell_seconds } */
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  let body: ContentViewPatchBody
  try {
    body = (await req.json()) as ContentViewPatchBody
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  if (!body.id || typeof body.dwell_seconds !== 'number') {
    return NextResponse.json({ error: 'id, dwell_seconds 가 필요합니다.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('content_views')
    .update({ dwell_seconds: body.dwell_seconds })
    .eq('id', body.id)
    .eq('user_id', user.id)

  if (error) {
    console.error('[content_views] 갱신 오류:', error)
    return NextResponse.json({ error: '열람 기록 갱신에 실패했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
