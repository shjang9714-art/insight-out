import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { findSimilarCandidatesWithBody } from './dedup'
import { isNearDup } from './similarity'
import { pickRepresentativeId, applyRepresentative, type ClusterMemberSignal } from './cluster'

export interface DrainOptions {
  limit?: number
  from?: string | null
  to?: string | null
  /** Date.now() 값. 설정 시 deadline 초과까지 반복, 미설정 시 단일 배치. */
  deadline?: number
}

export interface DrainResult {
  processed: number
  merged: number
  repChanged: number
  remaining: number
  /** false = cluster_checked_at 컬럼 미적용(42703) → 220 SQL 적용 필요 */
  ready: boolean
}

interface TargetRow {
  id: string
  title: string
  body_original: string | null
  published_at: string | null
  collected_at: string
  cluster_id: string | null
}

interface RawMemberRow {
  id: string
  thumbnail_url: string | null
  importance_score: number | null
  published_at: string | null
  collected_at: string
  cluster_id: string | null
  sources: { trust_tier: number | null } | { trust_tier: number | null }[] | null
}

function toMemberSignal(row: RawMemberRow): ClusterMemberSignal {
  const src = Array.isArray(row.sources) ? row.sources[0] : row.sources
  return {
    id: row.id,
    trust_tier: src?.trust_tier ?? null,
    thumbnail_url: row.thumbnail_url,
    importance_score: row.importance_score,
    published_at: row.published_at,
    collected_at: row.collected_at,
  }
}

const MEMBER_SELECT = 'id, thumbnail_url, importance_score, published_at, collected_at, cluster_id, sources(trust_tier)'

/** row 의 현재 대표 id(자신이 대표면 자기 id, 멤버면 cluster_id). */
function repOf(row: { id: string; cluster_id: string | null }): string {
  return row.cluster_id ?? row.id
}

export async function pendingCount(
  admin: SupabaseClient,
  from?: string | null,
  to?: string | null,
): Promise<number> {
  let q = admin
    .from('contents')
    .select('id', { count: 'exact', head: true })
    .eq('category', '뉴스')
    .is('cluster_checked_at', null)
    .not('body_fetched_at', 'is', null)
  if (from) q = q.gte('collected_at', from)
  if (to)   q = q.lte('collected_at', to + 'T23:59:59.999Z')
  const { count } = await q
  return count ?? 0
}

/**
 * 단일 대상 행의 재클러스터링 시도. 매칭 있으면 병합·대표 재선정, 항상 cluster_checked_at 기록.
 */
async function recheckOneCluster(
  admin: SupabaseClient,
  row: TargetRow,
): Promise<{ merged: boolean; repChanged: boolean }> {
  const candidates = await findSimilarCandidatesWithBody(admin, row.published_at, 7, 300)
  const directMatches = candidates.filter(
    c => c.id !== row.id &&
      isNearDup({ title: row.title, body: row.body_original }, { title: c.title, body: c.body_original }, true)
  )

  let merged = false
  let repChanged = false

  if (directMatches.length > 0) {
    const repIds = [...new Set([repOf(row), ...directMatches.map(repOf)])]

    const [{ data: repRows }, { data: memberRows }] = await Promise.all([
      admin.from('contents').select(MEMBER_SELECT).in('id', repIds),
      admin.from('contents').select(MEMBER_SELECT).in('cluster_id', repIds),
    ])

    const allRaw = [...(repRows ?? []), ...(memberRows ?? [])] as unknown as RawMemberRow[]
    const byId = new Map<string, RawMemberRow>()
    for (const r of allRaw) byId.set(r.id, r)
    // row 자신도 후보 집합에 확실히 포함(사인 필드는 후속 조회로 보강되지 않았을 수 있어 최소 필드만)
    if (!byId.has(row.id)) {
      byId.set(row.id, {
        id: row.id, thumbnail_url: null, importance_score: null,
        published_at: row.published_at, collected_at: row.collected_at, cluster_id: row.cluster_id, sources: null,
      })
    }

    const members = [...byId.values()].map(toMemberSignal)
    if (members.length > 1) {
      const newRepId = pickRepresentativeId(members)
      await applyRepresentative(admin, members, newRepId)
      merged = true
      repChanged = repIds.length > 1 || newRepId !== repIds[0]
    }
  }

  await admin
    .from('contents')
    .update({ cluster_checked_at: new Date().toISOString() })
    .eq('id', row.id)

  return { merged, repChanged }
}

/**
 * 관련기사 재클러스터링(본문 유사도) 백필 드레인(220).
 * deadline 미설정: 단일 배치(limit 건) 처리 후 반환.
 * deadline 설정: deadline 초과 또는 remaining=0까지 반복.
 * cluster_checked_at 컬럼 미적용(42703) 시 ready:false 로 graceful degrade(무한 루프 금지).
 */
export async function drainClusterBackfill(
  admin: SupabaseClient,
  { limit = 20, from, to, deadline }: DrainOptions = {},
): Promise<DrainResult> {
  let processed = 0, merged = 0, repChanged = 0, remaining = 0

  while (true) {
    if (deadline !== undefined && Date.now() >= deadline) break

    let targetQ = admin
      .from('contents')
      .select('id, title, body_original, published_at, collected_at, cluster_id')
      .eq('category', '뉴스')
      .is('cluster_checked_at', null)
      .not('body_fetched_at', 'is', null)
    if (from) targetQ = targetQ.gte('collected_at', from)
    if (to)   targetQ = targetQ.lte('collected_at', to + 'T23:59:59.999Z')

    const { data: targets, error } = await targetQ
      .order('collected_at', { ascending: false })
      .limit(limit)

    if (error) {
      if (error.code === '42703') {
        return { processed: 0, merged: 0, repChanged: 0, remaining: 0, ready: false }
      }
      break
    }

    if (!targets?.length) {
      remaining = await pendingCount(admin, from, to)
      break
    }

    for (const row of targets as TargetRow[]) {
      const result = await recheckOneCluster(admin, row)
      if (result.merged) merged++
      if (result.repChanged) repChanged++
    }
    processed += targets.length
    remaining = await pendingCount(admin, from, to)

    if (remaining === 0) break
    if (deadline === undefined) break
  }

  return { processed, merged, repChanged, remaining, ready: true }
}
