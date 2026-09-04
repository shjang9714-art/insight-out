'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, X } from 'lucide-react'
import LensSwitcher from '@/components/lens/LensSwitcher'
import { invalidateLensContext } from '@/lib/lens'
import { createClient } from '@/lib/supabase/client'

interface InterestRow {
  kind: 'entity' | 'topic'
  entity_id: string | null
  group_id: string | null
}

interface InterestItem {
  key: string
  kind: InterestRow['kind']
  targetId: string
  label: string
}

interface EntityNameRow {
  id: string
  canonical_name: string
}

interface TopicNameRow {
  id: string
  name: string
}

function interestKey(kind: InterestItem['kind'], targetId: string): string {
  return `${kind}:${targetId}`
}

export default function InterestRail() {
  const [items, setItems] = useState<InterestItem[]>([])
  const [pendingKeys, setPendingKeys] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadInterests = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (!cancelled) {
          setError('로그인이 필요합니다.')
          setLoading(false)
        }
        return
      }

      const { data, error: interestError } = await supabase
        .from('user_interests')
        .select('kind, entity_id, group_id')
        .eq('user_id', user.id)

      if (interestError) {
        console.warn('[InterestRail] 관심사 조회 실패:', interestError.message)
        if (!cancelled) {
          setError('관심사를 불러오지 못했습니다.')
          setLoading(false)
        }
        return
      }

      const rows = (data ?? []) as InterestRow[]
      const entityIds = rows.flatMap(row => row.entity_id ? [row.entity_id] : [])
      const groupIds = rows.flatMap(row => row.group_id ? [row.group_id] : [])
      const [entityResult, topicResult] = await Promise.all([
        entityIds.length > 0
          ? supabase.from('entities').select('id, canonical_name').in('id', entityIds)
          : Promise.resolve({ data: [], error: null }),
        groupIds.length > 0
          ? supabase.from('keyword_groups').select('id, name').in('id', groupIds)
          : Promise.resolve({ data: [], error: null }),
      ])

      if (entityResult.error || topicResult.error) {
        console.warn(
          '[InterestRail] 관심사 이름 조회 실패:',
          entityResult.error?.message ?? topicResult.error?.message,
        )
        if (!cancelled) {
          setError('관심사를 불러오지 못했습니다.')
          setLoading(false)
        }
        return
      }

      const entityNames = new Map(
        ((entityResult.data ?? []) as EntityNameRow[]).map(entity => [entity.id, entity.canonical_name]),
      )
      const topicNames = new Map(
        ((topicResult.data ?? []) as TopicNameRow[]).map(topic => [topic.id, topic.name]),
      )
      const loadedItems = rows.flatMap((row): InterestItem[] => {
        const targetId = row.kind === 'topic' ? row.group_id : row.entity_id
        const label = targetId
          ? row.kind === 'topic' ? topicNames.get(targetId) : entityNames.get(targetId)
          : null
        return targetId && label ? [{
          key: interestKey(row.kind, targetId),
          kind: row.kind,
          targetId,
          label,
        }] : []
      }).sort((left, right) => {
        if (left.kind !== right.kind) return left.kind === 'topic' ? -1 : 1
        return left.label.localeCompare(right.label, 'ko')
      })

      if (!cancelled) {
        setItems(loadedItems)
        setError(null)
        setLoading(false)
      }
    }

    void loadInterests()
    window.addEventListener('lens:context-changed', loadInterests)
    return () => {
      cancelled = true
      window.removeEventListener('lens:context-changed', loadInterests)
    }
  }, [])

  async function removeInterest(item: InterestItem) {
    if (pendingKeys.includes(item.key)) return
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

    if (item.kind === 'entity') {
      // 608 이행기 — user_watchlist 소비처 정리 후 제거
      const { error: watchlistError } = await supabase
        .from('user_watchlist')
        .delete()
        .eq('user_id', user.id)
        .eq('entity_id', item.targetId)
      if (watchlistError) {
        console.warn('[InterestRail] user_watchlist 동시 삭제 실패:', watchlistError.message)
      }
    }

    invalidateLensContext()
    setPendingKeys(previous => previous.filter(key => key !== item.key))
  }

  return (
    <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] space-y-5 overflow-y-auto px-1 py-6">
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">내 관심사</h2>
          <span className="text-xs tabular-nums text-muted-foreground">{items.length}개</span>
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground">불러오는 중...</p>
        ) : items.length === 0 ? (
          <div className="space-y-3">
            <p className="text-xs leading-5 text-muted-foreground">
              관심사를 고르면 화면이 내게 맞춰집니다
            </p>
            <Link
              href="/dashboard/mypage"
              className="inline-flex text-xs font-medium text-brand-600 hover:underline"
            >
              고르러 가기
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {items.map(item => (
              <span
                key={item.key}
                className="inline-flex min-w-0 items-center gap-1 rounded-full bg-brand-600/10 py-1 pl-2.5 pr-1 text-xs font-medium text-brand-600"
              >
                <span className="truncate">{item.label}</span>
                <button
                  type="button"
                  disabled={pendingKeys.includes(item.key)}
                  onClick={() => void removeInterest(item)}
                  className="shrink-0 rounded-full p-0.5 transition-colors hover:bg-brand-600/15 disabled:opacity-50"
                  aria-label={`${item.label} 관심사 해제`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

        <Link
          href="/dashboard/mypage"
          className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          관심사 추가
        </Link>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <LensSwitcher />
      </section>
    </div>
  )
}
