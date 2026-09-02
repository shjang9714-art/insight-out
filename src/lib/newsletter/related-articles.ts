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
/**
 * 클러스터 멤버 id `in(id,...)` 조회 청크 크기. id 목록이 길면(수백~천 단위) 요청이
 * 거부되므로(Bad Request) 200개씩 나눠 병렬 조회한다(지시서 20260902 §7-2).
 */
const CLUSTER_ID_CHUNK_SIZE = 200
/**
 * 카드 1장의 클러스터 후보 중 실제로 본문을 조회할 상한(=5청크 × 200). 대형 이슈는 클러스터
 * 멤버가 수백~천 건에 달할 수 있어(실측 최대 1,408건) 전량 조회는 비용이 크다. 예전엔 이 상한을
 * "먼저 만난 15건"에 걸어 최신순 정렬이 무의미해졌다(임의 15건 중 최신 3건) — 이제는 후보 수집
 * 자체엔 상한을 두지 않고, 본문 조회 단계에서만 상한을 적용해 정렬이 실제 후보군 전체를 반영하게 한다.
 */
const CLUSTER_CANDIDATE_FETCH_CAP = CLUSTER_ID_CHUNK_SIZE * 5

interface RelatedContentRow {
  id: string
  title: string
  original_url: string | null
  published_at: string | null
  summary_ko: string | null
  category: string
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
  'id, title, original_url, published_at, summary_ko, category, sources(name, type)'

/**
 * 카드마다 같은 이슈 클러스터에 속한 관련기사를 최대 3건 찾는다. 키워드 매칭 폴백은 쓰지 않는다
 * — 키워드 1개만 겹쳐도 통과하는 방식이라 주제가 무관한 기사가 자주 붙었다(지시서 20260902 §7-1
 * 실측: "하청 안전" 카드에 "현대차 데이터 플라이휠" 이 붙는 등). 같은 이슈 클러스터에 속한
 * 기사만 붙이고, 없으면 섹션을 그대로 숨긴다 — 붙는 빈도가 줄어드는 건 의도된 결과다.
 * LLM 호출 없이 순수 DB 조회. 실패해도 절대 throw 하지 않고 빈 Map 을 반환한다(관련기사 없이
 * 발송하는 폴백).
 */
export async function fetchRelatedArticles(
  supabase: SupabaseClient,
  cards: { id: string }[],
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

    // 카드별 이슈클러스터 후보 = 자기 이슈들에 속한 content_id 합집합 − 자기 자신 − excludeIds.
    // 여기서는 상한을 두지 않는다 — 상한을 두면 "임의로 먼저 만난 N건"이 되어 뒤의 최신순 정렬이
    // 무의미해진다(§7-2). 상한은 아래 본문 조회 단계에서만 건다.
    const clusterCandidates = new Map<string, Set<string>>()
    for (const card of cards) {
      const candidates = new Set<string>()
      for (const issueId of cardToIssueIds.get(card.id) ?? []) {
        for (const contentId of issueToContentIds.get(issueId) ?? []) {
          if (contentId === card.id) continue
          if (excludeIds.has(contentId)) continue
          candidates.add(contentId)
        }
      }
      clusterCandidates.set(card.id, candidates)
    }

    // 본문을 조회할 후보 id — 카드별로 최대 CLUSTER_CANDIDATE_FETCH_CAP 건만, 전체는 합집합(중복 제거).
    const allCandidateIds = new Set<string>()
    for (const set of clusterCandidates.values()) {
      let count = 0
      for (const id of set) {
        if (count >= CLUSTER_CANDIDATE_FETCH_CAP) break
        allCandidateIds.add(id)
        count++
      }
    }

    // 200개씩 청크로 나눠 병렬 조회(원래 Bad Request 는 id 목록이 길어서 났던 것이므로 청크로 해결된다).
    const contentById = new Map<string, RelatedContentRow>()
    const idsToFetch = Array.from(allCandidateIds)
    if (idsToFetch.length > 0) {
      const chunks: string[][] = []
      for (let i = 0; i < idsToFetch.length; i += CLUSTER_ID_CHUNK_SIZE) {
        chunks.push(idsToFetch.slice(i, i + CLUSTER_ID_CHUNK_SIZE))
      }

      const chunkResults = await Promise.all(
        chunks.map((chunk) =>
          supabase
            .from('contents')
            .select(RELATED_CONTENT_SELECT)
            .eq('status', 'published')
            .is('deleted_at', null)
            .not('summary_ko', 'is', null)
            .in('id', chunk)
        )
      )

      for (const { data, error } of chunkResults) {
        if (error) throw error
        const cleaned = excludeNonNews((data ?? []) as unknown as RelatedContentRow[])
        for (const r of cleaned) contentById.set(r.id, r)
      }
    }

    // 카드별 최종 조합: 이슈클러스터 후보 → 품질게이트 통과분만 → 제목 중복 제거 → 최신순 → 상한 3건
    for (const card of cards) {
      const candidateIds = clusterCandidates.get(card.id) ?? new Set<string>()

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
