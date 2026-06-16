import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserPreferenceKeywordIds } from '@/lib/preferences'
import { isB2BRelevant } from '@/lib/feed-blocklist'

const CONTENT_SELECT =
  'id, title, summary_ko, body_original, category, published_at, thumbnail_url, sources(name), matched_groups, matched_keywords'

interface ContentRow {
  title: string
  summary_ko: string | null
}

function filterB2BRelevant<T extends ContentRow>(rows: T[]): T[] {
  return rows.filter((row) => isB2BRelevant(row.title, row.summary_ko))
}

type Slot = 'personalized' | 'trending' | 'editor' | 'explore'

// TODO(04번 지시서): 실제 추천 랭킹(임베딩/CF 등)으로 교체. 현재는 슬롯 의미에 맞는
// 최소 쿼리(키워드 매칭/조회수/에디터픽/랜덤)로 동작하는 임시 구현.
async function fetchSlot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  slot: Slot,
  userId: string,
  limit: number
) {
  // B2B 무관 기사가 섞여 있을 수 있으므로 여유 있게 가져온 뒤 필터+slice
  const fetchLimit = limit * 3

  if (slot === 'personalized') {
    const keywordIds = await getUserPreferenceKeywordIds(supabase, userId)
    if (keywordIds.length === 0) {
      const { data } = await supabase
        .from('contents')
        .select(CONTENT_SELECT)
        .eq('status', 'published')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(fetchLimit)
      return filterB2BRelevant(data ?? []).slice(0, limit)
    }

    const { data: keywordRows } = await supabase
      .from('keywords')
      .select('name')
      .in('id', keywordIds)
    const names = (keywordRows ?? []).map((k) => (k as { name: string }).name)

    const { data } = await supabase
      .from('contents')
      .select(CONTENT_SELECT)
      .eq('status', 'published')
      .overlaps('matched_keywords', names)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(fetchLimit)
    return filterB2BRelevant(data ?? []).slice(0, limit)
  }

  if (slot === 'trending') {
    const { data } = await supabase
      .from('contents')
      .select(CONTENT_SELECT)
      .eq('status', 'published')
      .order('view_count', { ascending: false })
      .limit(fetchLimit)
    return filterB2BRelevant(data ?? []).slice(0, limit)
  }

  if (slot === 'editor') {
    const { data } = await supabase
      .from('contents')
      .select(CONTENT_SELECT)
      .eq('status', 'published')
      .eq('is_editor_pick', true)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(fetchLimit)
    return filterB2BRelevant(data ?? []).slice(0, limit)
  }

  // explore — 최근 발행분 중 무작위 노출(단순 셔플)
  const { data } = await supabase
    .from('contents')
    .select(CONTENT_SELECT)
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(fetchLimit * 2)
  const relevant = filterB2BRelevant(data ?? [])
  return [...relevant].sort(() => Math.random() - 0.5).slice(0, limit)
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const slot = searchParams.get('slot') as Slot | null
  const limit = Math.min(Number(searchParams.get('limit') ?? 6) || 6, 20)

  if (!slot || !['personalized', 'trending', 'editor', 'explore'].includes(slot)) {
    return NextResponse.json({ error: 'slot 파라미터가 올바르지 않습니다.' }, { status: 400 })
  }

  const items = await fetchSlot(supabase, slot, user.id, limit)
  return NextResponse.json({ items })
}
