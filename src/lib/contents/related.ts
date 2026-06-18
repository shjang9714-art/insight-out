import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface RelatedItem {
  id: string
  title: string
  summary_ko: string | null
  category: string
  published_at: string | null
  collected_at: string
  original_url: string | null
  sources: { name: string } | null
}

export interface YoutubeRelatedItem {
  id: string
  video_id: string
  title: string
  channel_name: string
  thumbnail_url: string | null
  published_at: string | null
}

// 표시 카테고리 버킷 (생성물 제외)
const BUCKET_MAP: Record<string, '뉴스' | '리서치' | '웹인사이트'> = {
  '뉴스':      '뉴스',
  '리포트':    '리서치',
  '가트너':    '리서치',
  'KRG':      '리서치',
  '웹인사이트': '웹인사이트',
  '오피니언':  '웹인사이트',
}

export type GroupedRelated = {
  [key in '뉴스' | '리서치' | '웹인사이트']?: RelatedItem[]
}

interface CurrentContent {
  id: string
  matched_keywords: string[] | null
  matched_groups: string[] | null
  cluster_id: string | null
}

interface RawRow {
  id: string
  title: string
  summary_ko: string | null
  category: string
  published_at: string | null
  collected_at: string
  original_url: string | null
  matched_keywords: string[] | null
  matched_groups: string[] | null
  cluster_id: string | null
  sources: { name: string } | null
}

const FIELDS =
  'id, title, summary_ko, category, published_at, collected_at, original_url, matched_keywords, matched_groups, cluster_id, sources(name)'

// ─── 겹침 카운트 ───────────────────────────────────────────────────────────────

function intersect(a: string[], b: string[]): number {
  const set = new Set(b)
  return a.filter((v) => set.has(v)).length
}

// ─── 메인 헬퍼 ────────────────────────────────────────────────────────────────

export async function getRelatedContents(
  supabase: SupabaseClient,
  current: CurrentContent,
  limit = 6,
): Promise<RelatedItem[]> {
  const kws = current.matched_keywords ?? []
  const grps = current.matched_groups ?? []

  if (kws.length === 0 && grps.length === 0) return []

  try {
    const fetchKws = async (): Promise<RawRow[]> => {
      if (kws.length === 0) return []
      const { data } = await supabase
        .from('contents')
        .select(FIELDS)
        .eq('status', 'published')
        .neq('id', current.id)
        .overlaps('matched_keywords', kws)
        .limit(30)
      return (data ?? []) as unknown as RawRow[]
    }

    const fetchGrps = async (): Promise<RawRow[]> => {
      if (grps.length === 0) return []
      const { data } = await supabase
        .from('contents')
        .select(FIELDS)
        .eq('status', 'published')
        .neq('id', current.id)
        .overlaps('matched_groups', grps)
        .limit(30)
      return (data ?? []) as unknown as RawRow[]
    }

    const results = await Promise.all([fetchKws(), fetchGrps()])

    // 병합 + dedup by id
    const seen = new Set<string>()
    const merged: RawRow[] = []
    for (const rows of results) {
      for (const row of rows) {
        if (!seen.has(row.id)) {
          seen.add(row.id)
          merged.push(row)
        }
      }
    }

    // 클러스터 근접중복 제외 (current.cluster_id 가 있을 때만)
    const clusterId = current.cluster_id
    const candidates = clusterId
      ? merged.filter(
          (r) => r.cluster_id !== clusterId && r.id !== clusterId
        )
      : merged

    // 점수 계산: 키워드 겹침 × 2 + 그룹 겹침 × 1
    const scored = candidates
      .map((r) => ({
        row: r,
        score:
          2 * intersect(kws, r.matched_keywords ?? []) +
          1 * intersect(grps, r.matched_groups ?? []),
      }))
      .filter(({ score }) => score > 0)

    // score desc, 동점 시 최신순
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const ta = a.row.collected_at ?? ''
      const tb = b.row.collected_at ?? ''
      return tb.localeCompare(ta)
    })

    return scored.slice(0, limit).map(({ row }) => ({
      id: row.id,
      title: row.title,
      summary_ko: row.summary_ko,
      category: row.category,
      published_at: row.published_at,
      collected_at: row.collected_at,
      original_url: row.original_url,
      sources: row.sources,
    }))
  } catch {
    // 추천 실패가 상세 렌더를 막지 않음
    return []
  }
}

// ─── 유형별 버킷 헬퍼 ─────────────────────────────────────────────────────────

export async function getRelatedGrouped(
  supabase: SupabaseClient,
  current: CurrentContent,
  perCat = 8,
): Promise<GroupedRelated> {
  const kws = current.matched_keywords ?? []
  const grps = current.matched_groups ?? []

  if (kws.length === 0 && grps.length === 0) return {}

  try {
    const fetchKws = async (): Promise<RawRow[]> => {
      if (kws.length === 0) return []
      const { data } = await supabase
        .from('contents')
        .select(FIELDS)
        .eq('status', 'published')
        .neq('id', current.id)
        .overlaps('matched_keywords', kws)
        .limit(60)
      return (data ?? []) as unknown as RawRow[]
    }

    const fetchGrps = async (): Promise<RawRow[]> => {
      if (grps.length === 0) return []
      const { data } = await supabase
        .from('contents')
        .select(FIELDS)
        .eq('status', 'published')
        .neq('id', current.id)
        .overlaps('matched_groups', grps)
        .limit(60)
      return (data ?? []) as unknown as RawRow[]
    }

    const results = await Promise.all([fetchKws(), fetchGrps()])

    const seen = new Set<string>()
    const merged: RawRow[] = []
    for (const rows of results) {
      for (const row of rows) {
        if (!seen.has(row.id)) {
          seen.add(row.id)
          merged.push(row)
        }
      }
    }

    const clusterId = current.cluster_id
    const candidates = clusterId
      ? merged.filter((r) => r.cluster_id !== clusterId && r.id !== clusterId)
      : merged

    const scored = candidates
      .map((r) => ({
        row: r,
        score:
          2 * intersect(kws, r.matched_keywords ?? []) +
          1 * intersect(grps, r.matched_groups ?? []),
      }))
      .filter(({ score }) => score > 0)

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return (b.row.collected_at ?? '').localeCompare(a.row.collected_at ?? '')
    })

    const buckets: GroupedRelated = {}
    const bucketCounts: Record<string, number> = {}

    for (const { row } of scored) {
      const bucket = BUCKET_MAP[row.category]
      if (!bucket) continue
      const count = bucketCounts[bucket] ?? 0
      if (count >= perCat) continue
      bucketCounts[bucket] = count + 1
      if (!buckets[bucket]) buckets[bucket] = []
      buckets[bucket]!.push({
        id: row.id,
        title: row.title,
        summary_ko: row.summary_ko,
        category: row.category,
        published_at: row.published_at,
        collected_at: row.collected_at,
        original_url: row.original_url,
        sources: row.sources,
      })
    }

    return buckets
  } catch {
    return {}
  }
}

// ─── 유튜브 제목 ILIKE 추천 ───────────────────────────────────────────────────

export async function getRelatedYoutube(
  supabase: SupabaseClient,
  current: CurrentContent,
  limit = 8,
): Promise<YoutubeRelatedItem[]> {
  const kws = (current.matched_keywords ?? []).slice(0, 5)
  if (kws.length === 0) return []

  // LIKE 특수문자 + PostgREST `,()` 정제
  const sanitize = (kw: string) =>
    kw.replace(/[,()]/g, '').replace(/[%_\\]/g, '\\$&').trim()

  const filters = kws
    .map(sanitize)
    .filter((s) => s.length > 0)
    .map((s) => `title.ilike.%${s}%`)
    .join(',')

  if (!filters) return []

  try {
    const { data } = await supabase
      .from('youtube_videos')
      .select('id, video_id, title, channel_name, thumbnail_url, published_at')
      .or(filters)
      .order('published_at', { ascending: false })
      .limit(limit)
    return (data ?? []) as YoutubeRelatedItem[]
  } catch {
    return []
  }
}
