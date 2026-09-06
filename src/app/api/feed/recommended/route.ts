import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isB2BRelevant } from '@/lib/feed-blocklist'
import { dedupSimilarItems } from '@/lib/feed-dedup'
import { hashtagsForCategories } from '@/lib/feed/categories'
import { getUserFeedCategories } from '@/lib/preferences'

const CONTENT_SELECT =
  'id, title, summary_ko, body_original, category, published_at, thumbnail_url, sources(name), matched_groups, matched_keywords'

type Slot = 'personalized' | 'trending' | 'editor' | 'explore'

interface RecommendedRow {
  content_id: string
  score: number
  slot: string
  reason_keys: string[]
}

interface ContentRow {
  id: string
  title: string
  summary_ko: string | null
  body_original: string | null
  category: string
  published_at: string | null
  thumbnail_url: string | null
  sources: { name: string } | null
  matched_groups: string[]
  matched_keywords: string[]
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

  // B2B 무관 기사 + 5일 초과 기사가 필터링되므로 여유 있게 가져온 뒤 필터+slice
  const fetchLimit = limit * 10

  // 최신 기사 위주 노출: 발행 5일 이내로 제한
  const RECENT_DAYS = 5
  const recentSince = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // 사용자가 고른 카테고리 → 해시태그로 펼쳐 RPC 매칭에 전달
  // (personalized/explore 만 사용, trending/editor 는 무시)
  let hashtags: string[] = []
  if (slot === 'personalized' || slot === 'explore') {
    const categoryKeys = await getUserFeedCategories(supabase, user.id)
    hashtags = hashtagsForCategories(categoryKeys)
    // personalized 인데 선택 카테고리가 없으면 매칭 대상이 없어 빈 결과
    if (slot === 'personalized' && hashtags.length === 0) {
      return NextResponse.json({ slot, items: [] })
    }
  }

  const { data: ranked, error: rpcError } = await supabase.rpc('get_recommended_feed', {
    p_user_id: user.id,
    p_slot: slot,
    p_hashtags: hashtags,
    p_limit: fetchLimit,
  })

  if (rpcError) {
    return NextResponse.json({ error: '추천 피드를 불러오지 못했습니다.' }, { status: 500 })
  }

  const rows = (ranked ?? []) as RecommendedRow[]
  if (rows.length === 0) {
    return NextResponse.json({ slot, items: [] })
  }

  const { data: contents } = await supabase
    .from('contents')
    .select(CONTENT_SELECT)
    .in('id', rows.map((row) => row.content_id))
    .gte('published_at', recentSince)

  const contentMap = new Map(
    (contents ?? []).map((c) => [(c as unknown as ContentRow).id, c as unknown as ContentRow])
  )
  const scoreMap = new Map(rows.map((row) => [row.content_id, row.score]))

  // RPC가 이미 점수순으로 정렬해 반환하므로 그 순서를 유지한 채 컨텐츠를 붙인다.
  const filtered = rows
    .map((row) => contentMap.get(row.content_id))
    .filter((c): c is ContentRow => c !== undefined)
    .filter((c) => isB2BRelevant(c.title, c.summary_ko))
  const deduped = dedupSimilarItems(filtered)
  // 최신순 정렬 — RPC 점수순 대신 발행일 내림차순으로 노출
  const sorted = deduped.sort((a, b) => {
    const ta = a.published_at ? new Date(a.published_at).getTime() : 0
    const tb = b.published_at ? new Date(b.published_at).getTime() : 0
    return tb - ta
  })
  const items = sorted
    .slice(0, limit)
    .map((c) => ({
      ...c,
      score: scoreMap.get(c.id) ?? 0,
    }))

  return NextResponse.json({ slot, items })
}
