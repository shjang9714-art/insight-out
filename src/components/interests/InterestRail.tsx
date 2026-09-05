'use client'

import { useEffect, useState } from 'react'
import { Heart, Plus, X } from 'lucide-react'
import InterestPickerDialog, {
  type SelectedInterest,
} from '@/components/interests/InterestPickerDialog'
import LensSwitcher from '@/components/lens/LensSwitcher'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { removeInterest } from '@/lib/interests/mutations'
import { createClient } from '@/lib/supabase/client'

interface InterestRow {
  kind: 'entity' | 'topic'
  entity_id: string | null
  group_id: string | null
}

interface EntityNameRow {
  id: string
  canonical_name: string
}

interface TopicNameRow {
  id: string
  name: string
}

function interestKey(kind: SelectedInterest['kind'], targetId: string): string {
  return `${kind}:${targetId}`
}

function sortInterests(items: SelectedInterest[]): SelectedInterest[] {
  return [...items].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'topic' ? -1 : 1
    return left.label.localeCompare(right.label, 'ko')
  })
}

interface RailContentProps {
  items: SelectedInterest[]
  pendingKeys: string[]
  loading: boolean
  error: string | null
  onRemove: (item: SelectedInterest) => void
  onOpenPicker: () => void
}

function RailContent({
  items,
  pendingKeys,
  loading,
  error,
  onRemove,
  onOpenPicker,
}: RailContentProps) {
  return (
    <div className="space-y-5">
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
            <button
              type="button"
              onClick={onOpenPicker}
              className="text-xs font-medium text-brand-600 hover:underline"
            >
              고르러 가기
            </button>
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
                  onClick={() => onRemove(item)}
                  className="shrink-0 rounded-full p-0.5 transition-colors hover:bg-brand-600/15 disabled:opacity-50"
                  aria-label={`${item.label} 관심사 해제`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}

        <button
          type="button"
          onClick={onOpenPicker}
          className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          관심사 추가
        </button>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <LensSwitcher />
      </section>
    </div>
  )
}

export default function InterestRail() {
  const [wide, setWide] = useState(false)
  const [hasButton, setHasButton] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [items, setItems] = useState<SelectedInterest[]>([])
  const [count, setCount] = useState<number | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [pendingKeys, setPendingKeys] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1620px)')
    const sync = () => setWide(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const sync = () => setHasButton(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (!hasButton || wide || pickerOpen) return
    let cancelled = false

    void (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { count: n, error: countError } = await supabase
        .from('user_interests')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
      if (countError) {
        console.warn('[InterestRail] 관심사 개수 조회 실패:', countError.message)
        return
      }
      if (!cancelled) setCount(n ?? 0)
    })()

    return () => { cancelled = true }
  }, [hasButton, wide, pickerOpen])

  useEffect(() => {
    if (!wide && !pickerOpen) return
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
      if (!cancelled) setUserId(user.id)

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
      const loadedItems = rows.flatMap((row): SelectedInterest[] => {
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
      })

      if (!cancelled) {
        setItems(sortInterests(loadedItems))
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
  }, [wide, pickerOpen])

  async function handleRemove(item: SelectedInterest) {
    if (pendingKeys.includes(item.key)) return
    setPendingKeys(previous => [...previous, item.key])
    setError(null)

    const supabase = createClient()
    const resolvedUserId = userId ?? (await supabase.auth.getUser()).data.user?.id
    if (!resolvedUserId) {
      setError('로그인이 필요합니다.')
      setPendingKeys(previous => previous.filter(key => key !== item.key))
      return
    }

    try {
      await removeInterest(supabase, resolvedUserId, item.kind, item.targetId)
      setItems(previous => previous.filter(existing => existing.key !== item.key))
    } catch (removeError) {
      console.warn(
        '[InterestRail] 관심사 해제 실패:',
        removeError instanceof Error ? removeError.message : removeError,
      )
      setError('관심사 해제에 실패했습니다.')
    } finally {
      setPendingKeys(previous => previous.filter(key => key !== item.key))
    }
  }

  function handleInterestChanged(item: SelectedInterest, selected: boolean) {
    setItems(previous => sortInterests(selected
      ? previous.some(existing => existing.key === item.key) ? previous : [...previous, item]
      : previous.filter(existing => existing.key !== item.key)))
  }

  const badgeCount = loading && count !== null ? count : items.length

  const content = (
    <RailContent
      items={items}
      pendingKeys={pendingKeys}
      loading={loading}
      error={error}
      onRemove={item => void handleRemove(item)}
      onOpenPicker={() => setDialogOpen(true)}
    />
  )

  return (
    <>
      <div className="fixed bottom-6 left-6 z-40 hidden w-48 min-[1620px]:block">
        {content}
      </div>

      <div className="fixed bottom-6 left-6 z-40 hidden md:block min-[1620px]:hidden">
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-lg transition-colors hover:text-foreground"
              aria-label="내 관심사 열기"
            >
              <Heart className="h-5 w-5" />
              {badgeCount > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-brand-600 px-1 text-center text-[10px] font-semibold leading-5 text-white">
                  {badgeCount}
                </span>
              ) : null}
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-64 p-0">
            {content}
          </PopoverContent>
        </Popover>
      </div>

      <InterestPickerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        selectedItems={items}
        userId={userId}
        onInterestChanged={handleInterestChanged}
      />
    </>
  )
}
