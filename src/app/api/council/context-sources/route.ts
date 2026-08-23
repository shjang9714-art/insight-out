import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getRelatedContents } from '@/lib/contents/related'

export const dynamic = 'force-dynamic'

interface EmbedSource {
  title: string
  url?: string
}

const SOURCE_LIMIT = 5

/**
 * GET /api/council/context-sources?ref=contents|entities&refId=<id>
 * 362 — COUNCIL push 진입점(CouncilDiscussButton)이 넘긴 ref/refId로 관련 근거
 * 상위 3~5건을 조회해 EmbedSource[]로 반환한다. published만, 세션 필요.
 * 실패·미존재는 빈 배열(그레이스풀) — 호출부가 concern/note만으로 폴백한다.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { searchParams, origin } = req.nextUrl
  const ref = searchParams.get('ref')
  const refId = searchParams.get('refId')
  if (!refId || (ref !== 'contents' && ref !== 'entities')) {
    return NextResponse.json({ sources: [] satisfies EmbedSource[] })
  }

  try {
    const sources = ref === 'contents'
      ? await sourcesFromContent(supabase, refId, origin)
      : await sourcesFromEntity(supabase, refId, origin)
    return NextResponse.json({ sources })
  } catch (err) {
    console.error('[council/context-sources] 조회 실패(graceful):', err)
    return NextResponse.json({ sources: [] satisfies EmbedSource[] })
  }
}

async function sourcesFromContent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contentId: string,
  origin: string,
): Promise<EmbedSource[]> {
  const { data } = await supabase
    .from('contents')
    .select('id, title, matched_keywords, matched_groups, cluster_id')
    .eq('id', contentId)
    .eq('status', 'published')
    .single()

  if (!data) return []
  const current = data as {
    id: string
    title: string
    matched_keywords: string[] | null
    matched_groups: string[] | null
    cluster_id: string | null
  }

  const related = await getRelatedContents(supabase, current, SOURCE_LIMIT - 1)

  return [
    { title: current.title, url: `${origin}/dashboard/contents/${current.id}` },
    ...related.map((r) => ({ title: r.title, url: `${origin}/dashboard/contents/${r.id}` })),
  ].slice(0, SOURCE_LIMIT)
}

async function sourcesFromEntity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entityId: string,
  origin: string,
): Promise<EmbedSource[]> {
  const { data, error } = await supabase.rpc('entity_recent_contents', {
    p_entity_id: entityId,
    p_limit: SOURCE_LIMIT,
  })
  if (error) {
    console.error('[council/context-sources] 엔티티 근거 조회 실패(graceful):', error)
    return []
  }

  return ((data ?? []) as { id: string; title: string }[])
    .map((r) => ({ title: r.title, url: `${origin}/dashboard/contents/${r.id}` }))
}
