import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * 대표 선정에 필요한 신호(220). trust_tier 는 sources 조인, 나머지는 contents 컬럼.
 */
export interface ClusterMemberSignal {
  id: string
  trust_tier: number | null
  thumbnail_url: string | null
  importance_score: number | null
  published_at: string | null
  collected_at: string
}

/**
 * 클러스터 대표 선정(220) — 신호 기반 정렬 우선순위:
 * 1. 소스 trust_tier desc(신뢰도 높은 소스 우선, null은 최하)
 * 2. thumbnail_url 유무(있음 우선)
 * 3. importance_score desc
 * 4. published_at 오름차순(최초 보도 우선, null은 후순위)
 * 5. collected_at asc(동률 시 먼저 수집된 행)
 * 반환: 대표로 선정된 멤버의 id.
 */
export function pickRepresentativeId(members: ClusterMemberSignal[]): string {
  const sorted = [...members].sort((a, b) => {
    const trustA = a.trust_tier ?? -1
    const trustB = b.trust_tier ?? -1
    if (trustA !== trustB) return trustB - trustA

    const thumbA = a.thumbnail_url ? 1 : 0
    const thumbB = b.thumbnail_url ? 1 : 0
    if (thumbA !== thumbB) return thumbB - thumbA

    const impA = a.importance_score ?? 0
    const impB = b.importance_score ?? 0
    if (impA !== impB) return impB - impA

    const pubA = a.published_at ? new Date(a.published_at).getTime() : Infinity
    const pubB = b.published_at ? new Date(b.published_at).getTime() : Infinity
    if (pubA !== pubB) return pubA - pubB

    return new Date(a.collected_at).getTime() - new Date(b.collected_at).getTime()
  })
  return sorted[0].id
}

/**
 * 대표 재지정 적용(220) — repId 행은 cluster_id=null(대표), 나머지 멤버는 cluster_id=repId.
 * 행 삭제·본문 변경 없음. 실패는 호출부에서 로그만(백필 무중단).
 */
export async function applyRepresentative(
  admin: SupabaseClient,
  members: { id: string }[],
  repId: string
): Promise<void> {
  const otherIds = members.map(m => m.id).filter(id => id !== repId)

  await admin
    .from('contents')
    .update({ cluster_id: null })
    .eq('id', repId)

  if (otherIds.length > 0) {
    await admin
      .from('contents')
      .update({ cluster_id: repId })
      .in('id', otherIds)
  }
}
