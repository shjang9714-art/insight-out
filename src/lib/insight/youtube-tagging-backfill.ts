import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ScoringGroup } from '@/lib/crawler/quality'
import { tagYoutubeContent } from '@/lib/crawler/orchestrator'

export interface BackfillYoutubeTaggingOpts {
  max?: number
  deadline?: number
}

export interface BackfillYoutubeTaggingResult {
  analyzed: number
  candidates: number
  reason?: string
}

interface KeywordGroupRow {
  name: string
  include_patterns: string[]
  exclude_patterns: string[]
  weight: number
  signal_hint: string | null
}

/**
 * 기존 유튜브 콘텐츠(크롤러가 분류 없이 mirror insert한 row)를 뉴스와 동일한
 * matched_groups/keywords·content_entities로 온디맨드 백필(252). sentiment/lgu-impact
 * 백필과 동일 패턴 — 어드민 트리거, deadline 인지, 실패해도 크래시 없음.
 */
export async function backfillYoutubeTagging(
  admin: SupabaseClient,
  opts: BackfillYoutubeTaggingOpts = {},
): Promise<BackfillYoutubeTaggingResult> {
  const max = Math.max(1, Math.min(opts.max ?? 100, 300))
  const deadline = opts.deadline

  const groupsRes = await admin
    .from('keyword_groups')
    .select('name, include_patterns, exclude_patterns, weight, signal_hint')
    .eq('is_active', true)
    .limit(200)
  if (groupsRes.error) {
    return { analyzed: 0, candidates: 0, reason: '키워드 그룹 조회 실패' }
  }
  const groups: ScoringGroup[] = (groupsRes.data as KeywordGroupRow[]).map(r => ({
    name: r.name,
    include_patterns: r.include_patterns,
    exclude_patterns: r.exclude_patterns,
    weight: r.weight,
    signal_hint: r.signal_hint,
  }))

  const aliasMap = new Map<string, string>()
  const aliasRes = await admin.from('entity_aliases').select('alias, entity_id').limit(5000)
  if (!aliasRes.error) {
    for (const row of (aliasRes.data ?? []) as { alias: string; entity_id: string }[]) {
      aliasMap.set(row.alias.toLowerCase(), row.entity_id)
    }
  }

  // 미분류 유튜브 후보 — matched_groups/keywords 기본값('{}')이라 null 체크로 못 걸러내므로
  // 최근분을 넉넉히 가져와 클라이언트에서 빈 배열만 필터(볼륨이 크지 않아 충분).
  const { data: rows } = await admin
    .from('contents')
    .select('id, title, matched_groups, matched_keywords')
    .eq('category', '유튜브')
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('collected_at', { ascending: false })
    .limit(max * 3)

  type YoutubeRow = { id: string; title: string; matched_groups: string[] | null; matched_keywords: string[] | null }
  const candidates = ((rows ?? []) as YoutubeRow[])
    .filter(r => (r.matched_groups?.length ?? 0) === 0 && (r.matched_keywords?.length ?? 0) === 0)
    .slice(0, max)

  if (candidates.length === 0) {
    const reason = (rows?.length ?? 0) === 0 ? '유튜브 콘텐츠 없음' : '미분류 유튜브 없음(이미 태깅됨)'
    return { analyzed: 0, candidates: 0, reason }
  }

  let analyzed = 0
  for (const row of candidates) {
    if (deadline && Date.now() >= deadline) break
    await tagYoutubeContent(admin, row.id, row.title, groups, aliasMap)
    analyzed++
  }

  return { analyzed, candidates: candidates.length }
}
