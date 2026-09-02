import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { filterOutStockContent, filterOutYoutubeContent } from '@/lib/newsletter/content-filter'
import { dedupeSimilarArticles } from '@/lib/daily-insights/dedupe'

export interface RelatedArticle {
  id: string
  title: string
  sourceName: string | null
  detailUrl: string
}

/** 카드마다 붙일 관련기사 상한. */
const MAX_RELATED_PER_CARD = 3
/** 이슈 클러스터 후보가 부족할 때, 키워드 매칭으로 보충 조회할 상한. */
const KEYWORD_FALLBACK_LIMIT = 10
/**
 * 카드 1장의 이슈클러스터 후보 상한. 대형 이슈는 클러스터 멤버가 수백 건에 달할 수 있어
 * (실측 확인) 상한 없이 합치면 3단계 본문조회의 `in(id, ...)` 목록이 커져 요청이 거부된다
 * (Bad Request). 최종 채택은 어차피 최신순 상위 3건뿐이라 여유분만 가져오면 충분하다.
 */
const CLUSTER_CANDIDATE_CAP_PER_CARD = 15

interface RelatedContentRow {
  id: string
  title: string
  original_url: string | null
  published_at: string | null
  summary_ko: string | null
  category: string
  matched_keywords: string[] | null
  sources: { name: string; type: string | null } | { name: string; type: string | null }[] | null
}

function extractSourceName(src: RelatedContentRow['sources']): string | null {
  if (Array.isArray(src)) return src[0]?.name ?? null
  return src?.name ?? null
}

function extractSourceType(src: RelatedContentRow['sources']): string | null {
  if (Array.isArray(src)) return src[0]?.type ?? null
  return src?.type ?? null
}

/** prepare-issue.ts 의 excludeNonNews 와 동일한 순서(유튜브 → 주식)로 필터한다. */
function excludeNonNews(rows: RelatedContentRow[]): RelatedContentRow[] {
  const { kept: keptAfterYoutube } = filterOutYoutubeContent(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      originalUrl: r.original_url,
      sourceType: extractSourceType(r.sources),
    }))
  )
  const notYoutubeIds = new Set(keptAfterYoutube.map((k) => k.id))
  const afterYoutube = rows.filter((r) => notYoutubeIds.has(r.id))

  const { kept } = filterOutStockContent(
    afterYoutube.map((r) => ({ id: r.id, title: r.title, category: r.category, summary_ko: r.summary_ko }))
  )
  const keptIds = new Set(kept.map((k) => k.id))
  return afterYoutube.filter((r) => keptIds.has(r.id))
}

const RELATED_CONTENT_SELECT =
  'id, title, original_url, published_at, summary_ko, category, matched_keywords, sources(name, type)'

/**
 * 카드마다 같은 사건을 다룬 관련기사를 최대 3건 찾는다(이슈 클러스터 우선 → 부족분 키워드 매칭).
 * LLM 호출 없이 순수 DB 조회. 카드가 몇 장이든 DB 왕복은 최대 4회(카드별 루프 안에서 쿼리 금지).
 * 실패해도 절대 throw 하지 않고 빈 Map 을 반환한다(관련기사 없이 발송하는 폴백).
 */
export async function fetchRelatedArticles(
  supabase: SupabaseClient,
  cards: { id: string; matchedKeywords: string[] }[],
  baseUrl: string,
  excludeIds: Set<string>,
): Promise<Map<string, RelatedArticle[]>> {
  const result = new Map<string, RelatedArticle[]>()
  if (cards.length === 0) return result

  try {
    const cardIds = cards.map((c) => c.id)

    // 1단계 — 이슈 클러스터: 카드 → issue_id[] → 그 이슈에 속한 content_id[] (DB 왕복 2회)
    const { data: cardIssueRows, error: cardIssueErr } = await supabase
      .from('issue_contents')
      .select('issue_id, content_id')
      .in('content_id', cardIds)
    if (cardIssueErr) throw cardIssueErr

    const cardToIssueIds = new Map<string, Set<string>>()
    const allIssueIds = new Set<string>()
    for (const row of cardIssueRows ?? []) {
      const contentId = row.content_id as string
      const issueId = row.issue_id as string
      if (!cardToIssueIds.has(contentId)) cardToIssueIds.set(contentId, new Set())
      cardToIssueIds.get(contentId)!.add(issueId)
      allIssueIds.add(issueId)
    }

    const issueToContentIds = new Map<string, Set<string>>()
    if (allIssueIds.size > 0) {
      const { data: issueContentRows, error: issueContentErr } = await supabase
        .from('issue_contents')
        .select('issue_id, content_id')
        .in('issue_id', Array.from(allIssueIds))
      if (issueContentErr) throw issueContentErr

      for (const row of issueContentRows ?? []) {
        const issueId = row.issue_id as string
        const contentId = row.content_id as string
        if (!issueToContentIds.has(issueId)) issueToContentIds.set(issueId, new Set())
        issueToContentIds.get(issueId)!.add(contentId)
      }
    }

    // 카드별 이슈클러스터 후보 = 자기 이슈들에 속한 content_id 합집합 − 자기 자신 − excludeIds
    const clusterCandidates = new Map<string, Set<string>>()
    for (const card of cards) {
      const candidates = new Set<string>()
      outer: for (const issueId of cardToIssueIds.get(card.id) ?? []) {
        for (const contentId of issueToContentIds.get(issueId) ?? []) {
          if (contentId === card.id) continue
          if (excludeIds.has(contentId)) continue
          candidates.add(contentId)
          if (candidates.size >= CLUSTER_CANDIDATE_CAP_PER_CARD) break outer
        }
      }
      clusterCandidates.set(card.id, candidates)
    }

    // 2단계 — 부족분(3건 미만)만 키워드 매칭으로 보충 (DB 왕복 최대 1회, 카드별 루프 안 아님)
    const cardsNeedingKeywordFallback = cards.filter(
      (c) => (clusterCandidates.get(c.id)?.size ?? 0) < MAX_RELATED_PER_CARD && c.matchedKeywords.length > 0
    )
    const keywordCandidateRows = new Map<string, RelatedContentRow[]>()
    if (cardsNeedingKeywordFallback.length > 0) {
      const allKeywords = Array.from(new Set(cardsNeedingKeywordFallback.flatMap((c) => c.matchedKeywords)))
      const { data: keywordRows, error: keywordErr } = await supabase
        .from('contents')
        .select(RELATED_CONTENT_SELECT)
        .eq('status', 'published')
        .is('deleted_at', null)
        .not('summary_ko', 'is', null)
        .overlaps('matched_keywords', allKeywords)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(KEYWORD_FALLBACK_LIMIT * cardsNeedingKeywordFallback.length)

      if (keywordErr) throw keywordErr
      const cleanedKeywordRows = excludeNonNews((keywordRows ?? []) as unknown as RelatedContentRow[])

      for (const card of cardsNeedingKeywordFallback) {
        const keywordSet = new Set(card.matchedKeywords)
        const matches = cleanedKeywordRows.filter((r) => {
          if (r.id === card.id) return false
          if (excludeIds.has(r.id)) return false
          if (clusterCandidates.get(card.id)?.has(r.id)) return false
          return r.matched_keywords?.some((k) => keywordSet.has(k)) ?? false
        })
        keywordCandidateRows.set(card.id, matches.slice(0, KEYWORD_FALLBACK_LIMIT))
      }
    }

    // 3단계 — 후보 id 전체를 한 번에 조회
    const allCandidateIds = new Set<string>()
    for (const set of clusterCandidates.values()) for (const id of set) allCandidateIds.add(id)
    for (const rows of keywordCandidateRows.values()) for (const r of rows) allCandidateIds.add(r.id)

    const contentById = new Map<string, RelatedContentRow>()
    for (const rows of keywordCandidateRows.values()) {
      for (const r of rows) contentById.set(r.id, r)
    }
    const idsToFetch = Array.from(allCandidateIds).filter((id) => !contentById.has(id))

    if (idsToFetch.length > 0) {
      const { data: contentRows, error: contentErr } = await supabase
        .from('contents')
        .select(RELATED_CONTENT_SELECT)
        .eq('status', 'published')
        .is('deleted_at', null)
        .not('summary_ko', 'is', null)
        .in('id', idsToFetch)
      if (contentErr) throw contentErr

      const cleaned = excludeNonNews((contentRows ?? []) as unknown as RelatedContentRow[])
      for (const r of cleaned) contentById.set(r.id, r)
    }

    // 카드별 최종 조합: 이슈클러스터 후보 + 키워드 후보 → 품질게이트 통과분만 → 제목 중복 제거 → 최신순 → 상한 3건
    for (const card of cards) {
      const candidateIds = new Set<string>([
        ...(clusterCandidates.get(card.id) ?? []),
        ...(keywordCandidateRows.get(card.id) ?? []).map((r) => r.id),
      ])

      const rows = Array.from(candidateIds)
        .map((id) => contentById.get(id))
        .filter((r): r is RelatedContentRow => r !== undefined)

      const deduped = dedupeSimilarArticles(
        rows.map((r) => ({ contentId: r.id, title: r.title, url: r.original_url, publishedAt: r.published_at }))
      )
      const dedupedIds = new Set(deduped.map((d) => d.contentId))

      const sorted = rows
        .filter((r) => dedupedIds.has(r.id))
        .sort((a, b) => {
          const at = a.published_at ? new Date(a.published_at).getTime() : 0
          const bt = b.published_at ? new Date(b.published_at).getTime() : 0
          return bt - at
        })
        .slice(0, MAX_RELATED_PER_CARD)

      result.set(
        card.id,
        sorted.map((r) => ({
          id: r.id,
          title: r.title,
          sourceName: extractSourceName(r.sources),
          detailUrl: `${baseUrl}/dashboard/contents/${r.id}`,
        }))
      )
    }

    return result
  } catch (err) {
    console.error('[뉴스레터/관련기사] 조회 실패, 관련기사 없이 폴백:', err instanceof Error ? err.message : err)
    return new Map<string, RelatedArticle[]>()
  }
}
