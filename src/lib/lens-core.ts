import type { SupabaseClient } from '@supabase/supabase-js'

export type LensKey = 'boost' | 'only' | 'all'

export interface LensInterestItem {
  key: string            // `${kind}:${id}` — InterestRail 이 쓰던 것과 같은 모양
  kind: 'entity' | 'topic'
  id: string
  name: string
}

export interface LensContext {
  items: LensInterestItem[]
  entityIds: string[]
  topicNames: string[]
  normalizedTopicNames: string[]
  names: string[]
  count: number
  defaultLens: LensKey
}

export interface LensTarget {
  names?: string[]
  text?: string[]
  groups?: string[]
  isCompetitor?: boolean
  entityId?: string
}

export const LENS_PRESETS: Record<LensKey, { label: string; desc: string }> = {
  boost: { label: '관심사 우선',   desc: '관련을 위로, 나머지도 보여줍니다' },
  only:  { label: '관심사만 보기', desc: '선택한 관심사 관련만' },
  all:   { label: '전체 보기',     desc: '관심사 영향 없음' },
}

export const EMPTY_LENS_CONTEXT: LensContext = {
  items: [],
  entityIds: [],
  topicNames: [],
  normalizedTopicNames: [],
  names: [],
  count: 0,
  defaultLens: 'all',
}

function deriveLensFields(items: LensInterestItem[]): Pick<
  LensContext, 'entityIds' | 'topicNames' | 'normalizedTopicNames' | 'names' | 'count'
> {
  const entityIds = items.filter(item => item.kind === 'entity').map(item => item.id)
  const topicNames = items.filter(item => item.kind === 'topic').map(item => item.name)
  return {
    entityIds,
    topicNames,
    normalizedTopicNames: topicNames.map(normalizeLensName),
    names: Array.from(new Set(items.map(item => item.name).map(normalizeLensName))),
    count: items.length,
  }
}

/** 사이드바에서 고른 부분집합만 남긴 컨텍스트를 만든다. `lensScore`·`matchesLens`는 그대로 쓴다. */
export function deriveSelectedContext(ctx: LensContext, selectedKeys: string[]): LensContext {
  if (selectedKeys.length === 0) return ctx

  const selectedKeySet = new Set(selectedKeys)
  const selectedItems = ctx.items.filter(item => selectedKeySet.has(item.key))

  return {
    ...ctx,
    ...deriveLensFields(selectedItems),
  }
}

type SupabaseLike = Pick<SupabaseClient, 'from'>

interface UserInterestRow {
  kind: string
  entity_id: string | null
  group_id: string | null
}

/** 비교용 정규화 — 소문자 + 공백·중점·하이픈 제거. 그 외 문자는 건드리지 않는다. */
export function normalizeLensName(s: string): string {
  return s.toLowerCase().replace(/[\s·・\-_]/g, '')
}

export function lensScore(key: LensKey, ctx: LensContext, target: LensTarget): number {
  if (key === 'all') return 0
  if (target.entityId && ctx.entityIds.includes(target.entityId)) return 3

  if (target.groups?.map(normalizeLensName).some(group => ctx.normalizedTopicNames.includes(group))) return 2

  if (target.names?.map(normalizeLensName).some(name => ctx.names.includes(name))) return 2

  // 관심사 이름이 바늘이고 자유 텍스트가 건초더미다. 역방향은 짧은 텍스트의 오탐을 되살린다.
  if (target.text?.some(text => ctx.names.some(interestName =>
    interestName.length >= 2 && normalizeLensName(text).includes(interestName)
  ))) return 1

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
        .select('kind, entity_id, group_id')
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

    const entityItems: LensInterestItem[] = ((entitiesRes.data ?? []) as { id: string; canonical_name: string }[])
      .map(row => ({ key: `entity:${row.id}`, kind: 'entity' as const, id: row.id, name: row.canonical_name }))
    const topicItems: LensInterestItem[] = ((groupsRes.data ?? []) as { id: string; name: string }[])
      .map(row => ({ key: `topic:${row.id}`, kind: 'topic' as const, id: row.id, name: row.name }))
    const items = [...entityItems, ...topicItems]

    const storedDefaultLens = userRes.data?.default_lens
    const defaultLens: LensKey =
      !userRes.error && (storedDefaultLens === 'boost' || storedDefaultLens === 'only' || storedDefaultLens === 'all')
        ? storedDefaultLens
        : 'all'

    return {
      items,
      ...deriveLensFields(items),
      defaultLens,
    }
  } catch (error) {
    console.warn('[렌즈] 컨텍스트 로드 오류:', error)
    return EMPTY_LENS_CONTEXT
  }
}
