'use client'

import { useEffect, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  fetchSelectableTopics,
  type SelectableTopic,
} from '@/lib/interests/topics'
import { invalidateLensContext } from '@/lib/lens'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const MAX_ENTITY_INTERESTS = 30

interface EntityOption {
  id: string
  canonical_name: string
  entity_type: string
  is_competitor: boolean
}

interface InterestItem {
  key: string
  kind: 'entity' | 'topic'
  targetId: string
  label: string
  entity?: EntityOption
}

interface InterestRow {
  kind: 'entity' | 'topic'
  entity_id: string | null
  group_id: string | null
}

interface SignalRow {
  entity_id: string
  content_count: number
}

function interestKey(kind: InterestItem['kind'], targetId: string): string {
  return `${kind}:${targetId}`
}

export default function InterestManager() {
  const [items, setItems] = useState<InterestItem[]>([])
  const [topics, setTopics] = useState<SelectableTopic[]>([])
  const [recommendedEntities, setRecommendedEntities] = useState<EntityOption[]>([])
  const [searchResults, setSearchResults] = useState<EntityOption[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [pendingKeys, setPendingKeys] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (!cancelled) {
          setError('로그인이 필요합니다.')
          setLoading(false)
        }
        return
      }

      const [interestResult, topicResult, competitorResult, signalResult] = await Promise.all([
        supabase
          .from('user_interests')
          .select('kind, entity_id, group_id')
          .eq('user_id', user.id),
        fetchSelectableTopics(supabase)
          .then(data => ({ data, error: null }))
          .catch((error: unknown) => ({ data: null, error })),
        supabase
          .from('entities')
          .select('id, canonical_name, entity_type, is_competitor')
          .eq('is_competitor', true)
          .in('entity_type', ['company', 'org'])
          .order('canonical_name'),
        supabase
          .from('entity_signal_summary')
          .select('entity_id, content_count')
          .order('content_count', { ascending: false }),
      ])

      if (interestResult.error || topicResult.error || competitorResult.error || signalResult.error) {
        console.warn('[InterestManager] 관심사 초기 조회 실패:',
          interestResult.error?.message
          ?? (topicResult.error instanceof Error ? topicResult.error.message : null)
          ?? competitorResult.error?.message ?? signalResult.error?.message)
        if (!cancelled) {
          setError('관심사 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
          setLoading(false)
        }
        return
      }

      const interestRows = (interestResult.data ?? []) as InterestRow[]
      const entityIds = interestRows.flatMap(row => row.entity_id ? [row.entity_id] : [])
      const groupIds = interestRows.flatMap(row => row.group_id ? [row.group_id] : [])
      const signalRows = (signalResult.data ?? []) as SignalRow[]
      const rankedEntityIds = signalRows.map(row => row.entity_id)
      const idsToLoad = [...new Set([...entityIds, ...rankedEntityIds])]

      const [entityResult, selectedTopicResult] = await Promise.all([
        idsToLoad.length > 0
          ? supabase
            .from('entities')
            .select('id, canonical_name, entity_type, is_competitor')
            .in('id', idsToLoad)
          : Promise.resolve({ data: [], error: null }),
        groupIds.length > 0
          ? supabase.from('keyword_groups').select('id, name').in('id', groupIds)
          : Promise.resolve({ data: [], error: null }),
      ])

      if (entityResult.error || selectedTopicResult.error) {
        console.warn('[InterestManager] 선택된 관심사 이름 조회 실패:',
          entityResult.error?.message ?? selectedTopicResult.error?.message)
        if (!cancelled) {
          setError('선택한 관심사를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
          setLoading(false)
        }
        return
      }

      const entities = (entityResult.data ?? []) as EntityOption[]
      const entityById = new Map(entities.map(entity => [entity.id, entity]))
      const selectedTopicById = new Map(
        ((selectedTopicResult.data ?? []) as SelectableTopic[]).map(topic => [topic.id, topic]),
      )
      const loadedItems = interestRows.flatMap((row): InterestItem[] => {
        if (row.kind === 'entity' && row.entity_id) {
          const entity = entityById.get(row.entity_id)
          return entity ? [{
            key: interestKey('entity', entity.id),
            kind: 'entity',
            targetId: entity.id,
            label: entity.canonical_name,
            entity,
          }] : []
        }
        if (row.kind === 'topic' && row.group_id) {
          const topic = selectedTopicById.get(row.group_id)
          return topic ? [{
            key: interestKey('topic', topic.id),
            kind: 'topic',
            targetId: topic.id,
            label: topic.name,
          }] : []
        }
        return []
      })

      const competitors = (competitorResult.data ?? []) as EntityOption[]
      const competitorIds = new Set(competitors.map(entity => entity.id))
      const topEntities = rankedEntityIds
        .map(id => entityById.get(id))
        .filter((entity): entity is EntityOption => Boolean(
          entity && ['company', 'org'].includes(entity.entity_type) && !competitorIds.has(entity.id),
        ))
        .slice(0, 30)

      if (!cancelled) {
        setItems(loadedItems)
        setTopics(topicResult.data ?? [])
        setRecommendedEntities([...competitors, ...topEntities])
        setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const query = searchTerm.trim()
    if (!query) return

    let cancelled = false
    const timer = window.setTimeout(async () => {
      const supabase = createClient()
      const { data, error: searchError } = await supabase
        .from('entities')
        .select('id, canonical_name, entity_type, is_competitor')
        .in('entity_type', ['company', 'org'])
        .ilike('canonical_name', `%${query}%`)
        .order('is_competitor', { ascending: false })
        .order('canonical_name')
        .limit(30)

      if (searchError) {
        console.warn('[InterestManager] 엔티티 검색 실패:', searchError.message)
        if (!cancelled) setError('검색 결과를 불러오지 못했습니다.')
        return
      }
      if (!cancelled) setSearchResults((data ?? []) as EntityOption[])
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [searchTerm])

  const selectedKeys = new Set(items.map(item => item.key))
  const entityCount = items.filter(item => item.kind === 'entity').length

  async function addInterest(item: InterestItem) {
    if (item.kind === 'entity' && entityCount >= MAX_ENTITY_INTERESTS) {
      setError(`관심 기업은 최대 ${MAX_ENTITY_INTERESTS}개까지 고를 수 있습니다`)
      return
    }

    setError(null)
    setPendingKeys(previous => [...previous, item.key])
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('로그인이 필요합니다.')
      setPendingKeys(previous => previous.filter(key => key !== item.key))
      return
    }

    const { error: insertError } = await supabase
      .from('user_interests')
      .insert({
        user_id: user.id,
        kind: item.kind,
        entity_id: item.kind === 'entity' ? item.targetId : null,
        group_id: item.kind === 'topic' ? item.targetId : null,
        weight: 1,
      })

    if (insertError && insertError.code !== '23505') {
      setError('관심사 추가에 실패했습니다.')
      setPendingKeys(previous => previous.filter(key => key !== item.key))
      return
    }

    setItems(previous => previous.some(existing => existing.key === item.key)
      ? previous
      : [...previous, item])
    invalidateLensContext()

    if (item.kind === 'entity' && item.entity) {
      // 608 이행기 — user_watchlist 소비처 정리 후 제거
      const { error: watchlistError } = await supabase.from('user_watchlist').insert({
        user_id: user.id,
        company: item.entity.canonical_name,
        entity_id: item.entity.id,
      })
      if (watchlistError && watchlistError.code !== '23505') {
        console.warn('[InterestManager] user_watchlist 동시 쓰기 실패:', watchlistError.message)
      }
    }
    setPendingKeys(previous => previous.filter(key => key !== item.key))
  }

  async function removeInterest(item: InterestItem) {
    setError(null)
    setPendingKeys(previous => [...previous, item.key])
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('로그인이 필요합니다.')
      setPendingKeys(previous => previous.filter(key => key !== item.key))
      return
    }

    let deleteQuery = supabase
      .from('user_interests')
      .delete()
      .eq('user_id', user.id)
      .eq('kind', item.kind)
    deleteQuery = item.kind === 'entity'
      ? deleteQuery.eq('entity_id', item.targetId)
      : deleteQuery.eq('group_id', item.targetId)
    const { error: deleteError } = await deleteQuery

    if (deleteError) {
      setError('관심사 해제에 실패했습니다.')
      setPendingKeys(previous => previous.filter(key => key !== item.key))
      return
    }

    setItems(previous => previous.filter(existing => existing.key !== item.key))
    invalidateLensContext()

    if (item.kind === 'entity') {
      // 608 이행기 — user_watchlist 소비처 정리 후 제거
      const { error: watchlistError } = await supabase
        .from('user_watchlist')
        .delete()
        .eq('user_id', user.id)
        .eq('entity_id', item.targetId)
      if (watchlistError) {
        console.warn('[InterestManager] user_watchlist 동시 삭제 실패:', watchlistError.message)
      }
    }
    setPendingKeys(previous => previous.filter(key => key !== item.key))
  }

  function toggleInterest(item: InterestItem) {
    if (pendingKeys.includes(item.key)) return
    if (selectedKeys.has(item.key)) void removeInterest(item)
    else void addInterest(item)
  }

  function entityToInterest(entity: EntityOption): InterestItem {
    return {
      key: interestKey('entity', entity.id),
      kind: 'entity',
      targetId: entity.id,
      label: entity.canonical_name,
      entity,
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">선택한 관심사</p>
        <div className="flex min-h-11 flex-wrap gap-2 rounded-lg border border-border bg-background p-3">
          {loading ? (
            <span className="text-sm text-muted-foreground">불러오는 중...</span>
          ) : items.length === 0 ? (
            <span className="text-sm text-muted-foreground">관심사를 고르면 화면이 내게 맞춰집니다</span>
          ) : items.map(item => (
            <button
              key={item.key}
              type="button"
              disabled={pendingKeys.includes(item.key)}
              onClick={() => toggleInterest(item)}
              className="inline-flex items-center gap-1 rounded-full bg-brand-600/10 px-3 py-1.5 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-600/20 disabled:opacity-50"
              aria-label={`${item.label} 관심사 해제`}
            >
              {item.label}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">토픽 고르기</p>
        <div className="flex flex-wrap gap-2">
          {topics.map(topic => {
            const item: InterestItem = {
              key: interestKey('topic', topic.id),
              kind: 'topic',
              targetId: topic.id,
              label: topic.name,
            }
            const selected = selectedKeys.has(item.key)
            return (
              <button
                key={topic.id}
                type="button"
                disabled={pendingKeys.includes(item.key)}
                onClick={() => toggleInterest(item)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                  selected
                    ? 'border-brand-600 bg-brand-600/10 text-brand-600'
                    : 'border-border text-muted-foreground hover:border-brand-200 hover:text-foreground',
                )}
              >
                {selected && <Check className="mr-1 inline h-3 w-3" />}
                {topic.name}
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">기업·기관 고르기</p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              className="pl-9"
              placeholder="기업·기관 이름 검색"
              aria-label="기업·기관 이름 검색"
            />
          </div>
        </div>

        <div className="flex max-h-56 flex-wrap content-start gap-2 overflow-y-auto rounded-lg border border-border bg-background p-3">
          {(searchTerm.trim() ? searchResults : recommendedEntities).map(entity => {
            const item = entityToInterest(entity)
            const selected = selectedKeys.has(item.key)
            return (
              <button
                key={entity.id}
                type="button"
                disabled={pendingKeys.includes(item.key)}
                onClick={() => toggleInterest(item)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                  selected
                    ? 'border-brand-600 bg-brand-600/10 text-brand-600'
                    : 'border-border text-muted-foreground hover:border-brand-200 hover:text-foreground',
                )}
              >
                {selected && <Check className="mr-1 inline h-3 w-3" />}
                {entity.canonical_name}
              </button>
            )
          })}
        </div>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        선택한 관심사는 기업동향·AI 인사이트·검색 등 개인화 화면에 즉시 반영됩니다.
      </p>
      {error && <p className="text-xs text-negative">{error}</p>}
    </div>
  )
}
