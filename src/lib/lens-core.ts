import type { SupabaseClient } from '@supabase/supabase-js'

export type LensKey = 'watch' | 'all'

export interface LensContext {
  entityIds: string[]
  topicNames: string[]
  names: string[]
  count: number
  defaultLens: LensKey
}

export interface LensTarget {
  names?: string[]
  groups?: string[]
  isCompetitor?: boolean
  entityId?: string
}

export const LENS_PRESETS: Record<LensKey, { label: string; desc: string }> = {
  watch: { label: '내 관심사', desc: '관심 기업·토픽만' },
  all:   { label: '전체',      desc: '모든 콘텐츠 보기' },
}

export const EMPTY_LENS_CONTEXT: LensContext = {
  entityIds: [],
  topicNames: [],
  names: [],
  count: 0,
  defaultLens: 'all',
}

type SupabaseLike = Pick<SupabaseClient, 'from'>

interface UserInterestRow {
  kind: string
  entity_id: string | null
  group_id: string | null
  weight: number
}

/** 비교용 정규화 — 소문자 + 공백·중점·하이픈 제거. 그 외 문자는 건드리지 않는다. */
export function normalizeLensName(s: string): string {
  return s.toLowerCase().replace(/[\s·・\-_]/g, '')
}

export function lensScore(key: LensKey, ctx: LensContext, target: LensTarget): number {
  if (key === 'all') return 0
  if (target.isCompetitor) return 3
  if (target.entityId && ctx.entityIds.includes(target.entityId)) return 3

  const topicNameSet = new Set(ctx.topicNames.map(normalizeLensName))
  if (target.groups?.some(group => topicNameSet.has(normalizeLensName(group)))) return 2

  const contextNameSet = new Set(ctx.names)
  if (target.names?.some(name => contextNameSet.has(normalizeLensName(name)))) return 2

  return 0
}

export function matchesLens(key: LensKey, ctx: LensContext, target: LensTarget): boolean {
  return lensScore(key, ctx, target) > 0
}

export async function loadLensContext(
  supabase: SupabaseLike,
  userId: string,
): Promise<LensContext> {
  try {
    const [interestsRes, userRes] = await Promise.all([
      supabase
        .from('user_interests')
        .select('kind, entity_id, group_id, weight')
        .eq('user_id', userId)
        .limit(200),
      supabase
        .from('users')
        .select('default_lens')
        .eq('id', userId)
        .single(),
    ])

    if (interestsRes.error) {
      if (interestsRes.error.code !== '42P01') {
        console.warn('[렌즈] 관심사 조회 오류:', interestsRes.error.message)
      }
      return EMPTY_LENS_CONTEXT
    }

    const interests = (interestsRes.data ?? []) as UserInterestRow[]
    if (interests.length === 200) {
      console.warn('[렌즈] 관심사 조회가 200행 상한에 도달했습니다.')
    }

    const entityIds = Array.from(new Set(
      interests
        .filter(row => row.kind === 'entity')
        .map(row => row.entity_id)
        .filter((id): id is string => Boolean(id)),
    ))
    const groupIds = Array.from(new Set(
      interests
        .filter(row => row.kind === 'topic')
        .map(row => row.group_id)
        .filter((id): id is string => Boolean(id)),
    ))

    const [entitiesRes, groupsRes] = await Promise.all([
      entityIds.length > 0
        ? supabase.from('entities').select('id, canonical_name').in('id', entityIds)
        : Promise.resolve({ data: [], error: null }),
      groupIds.length > 0
        ? supabase.from('keyword_groups').select('id, name').in('id', groupIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (entitiesRes.error) console.warn('[렌즈] 관심 엔티티 조회 오류:', entitiesRes.error.message)
    if (groupsRes.error) console.warn('[렌즈] 관심 토픽 조회 오류:', groupsRes.error.message)

    const entityNames = ((entitiesRes.data ?? []) as { id: string; canonical_name: string }[])
      .map(row => row.canonical_name)
    const topicNames = ((groupsRes.data ?? []) as { id: string; name: string }[])
      .map(row => row.name)
    const storedDefaultLens = userRes.data?.default_lens
    const defaultLens: LensKey =
      !userRes.error && (storedDefaultLens === 'watch' || storedDefaultLens === 'all')
        ? storedDefaultLens
        : 'all'

    return {
      entityIds,
      topicNames,
      names: Array.from(new Set([...entityNames, ...topicNames].map(normalizeLensName))),
      count: entityIds.length + topicNames.length,
      defaultLens,
    }
  } catch (error) {
    console.warn('[렌즈] 컨텍스트 로드 오류:', error)
    return EMPTY_LENS_CONTEXT
  }
}
