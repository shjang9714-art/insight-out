import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isB2BRelevant } from '@/lib/feed-blocklist'
import { dedupSimilarItems } from '@/lib/feed-dedup'

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

  // B2B 무관 기사가 섞여 있을 수 있으므로 여유 있게 가져온 뒤 필터+slice
  const fetchLimit = limit * 5

  const { data: ranked, error: rpcError } = await supabase.rpc('get_recommended_feed', {
    p_user_id: user.id,
    p_slot: slot,
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
  const items = deduped
    .slice(0, limit)
    .map((c) => ({
      ...c,
      score: scoreMap.get(c.id) ?? 0,
    }))

  return NextResponse.json({ slot, items })
}
