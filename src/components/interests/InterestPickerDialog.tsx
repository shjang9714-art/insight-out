'use client'

import { useEffect, useState } from 'react'
import { Check, Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  fetchSelectableCompetitors,
  type SelectableEntity,
} from '@/lib/interests/options'
import { addInterest, removeInterest, type InterestKind } from '@/lib/interests/mutations'
import { fetchSelectableTopics, type SelectableTopic } from '@/lib/interests/topics'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

export interface SelectedInterest {
  key: string
  kind: InterestKind
  targetId: string
  label: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedItems: SelectedInterest[]
  userId: string | null
  onInterestChanged: (item: SelectedInterest, selected: boolean) => void
}

type TabKey = 'entity' | 'topic'

function optionKey(kind: InterestKind, targetId: string): string {
  return `${kind}:${targetId}`
}

export default function InterestPickerDialog({
  open,
  onOpenChange,
  selectedItems,
  userId,
  onInterestChanged,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('entity')
  const [entities, setEntities] = useState<SelectableEntity[]>([])
  const [topics, setTopics] = useState<SelectableTopic[]>([])
  const [entitySearch, setEntitySearch] = useState('')
  const [topicSearch, setTopicSearch] = useState('')
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [pendingKeys, setPendingKeys] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || loaded) return
    let cancelled = false

    const supabase = createClient()
    Promise.all([
      fetchSelectableCompetitors(supabase),
      fetchSelectableTopics(supabase),
    ]).then(([loadedEntities, loadedTopics]) => {
      if (cancelled) return
      setEntities(loadedEntities)
      setTopics(loadedTopics)
      setLoaded(true)
      setLoading(false)
    }).catch((loadError: unknown) => {
      console.warn(
        '[InterestPickerDialog] 선택지 조회 실패:',
        loadError instanceof Error ? loadError.message : loadError,
      )
      if (!cancelled) {
        setError('관심사 선택지를 불러오지 못했습니다.')
        setLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [loaded, open])

  const selectedKeys = new Set(selectedItems.map(item => item.key))
  const query = (activeTab === 'entity' ? entitySearch : topicSearch).trim().toLocaleLowerCase('ko')
  const visibleOptions = activeTab === 'entity'
    ? entities
      .filter(entity => entity.canonical_name.toLocaleLowerCase('ko').includes(query))
      .map(entity => ({ id: entity.id, label: entity.canonical_name }))
    : topics
      .filter(topic => topic.name.toLocaleLowerCase('ko').includes(query))
      .map(topic => ({ id: topic.id, label: topic.name }))

  function isSelected(key: string): boolean {
    return overrides[key] ?? selectedKeys.has(key)
  }

  async function toggleOption(targetId: string, label: string) {
    const kind: InterestKind = activeTab
    const key = optionKey(kind, targetId)
    if (pendingKeys.includes(key)) return

    const nextSelected = !isSelected(key)
    setOverrides(previous => ({ ...previous, [key]: nextSelected }))
    setPendingKeys(previous => [...previous, key])
    setError(null)

    const supabase = createClient()
    const resolvedUserId = userId ?? (await supabase.auth.getUser()).data.user?.id
    if (!resolvedUserId) {
      setOverrides(previous => {
        const next = { ...previous }
        delete next[key]
        return next
      })
      setPendingKeys(previous => previous.filter(pendingKey => pendingKey !== key))
      setError('로그인이 필요합니다.')
      return
    }

    try {
      if (nextSelected) await addInterest(supabase, resolvedUserId, kind, targetId)
      else await removeInterest(supabase, resolvedUserId, kind, targetId)
      onInterestChanged({ key, kind, targetId, label }, nextSelected)
    } catch (mutationError) {
      console.warn(
        '[InterestPickerDialog] 관심사 변경 실패:',
        mutationError instanceof Error ? mutationError.message : mutationError,
      )
      setOverrides(previous => {
        const next = { ...previous }
        delete next[key]
        return next
      })
      setError(`${label} 관심사를 변경하지 못했습니다.`)
    } finally {
      setPendingKeys(previous => previous.filter(pendingKey => pendingKey !== key))
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setOverrides({})
      setError(null)
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>관심사 추가</DialogTitle>
          <DialogDescription>관심 있는 경쟁사와 토픽을 선택하세요. 변경은 즉시 반영됩니다.</DialogDescription>
        </DialogHeader>

        <div className="mb-4 grid grid-cols-2 rounded-lg bg-muted p-1">
          {([
            { key: 'entity' as const, label: '경쟁사' },
            { key: 'topic' as const, label: '토픽' },
          ]).map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                activeTab === tab.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={activeTab === 'entity' ? entitySearch : topicSearch}
            onChange={event => activeTab === 'entity'
              ? setEntitySearch(event.target.value)
              : setTopicSearch(event.target.value)}
            placeholder={`${activeTab === 'entity' ? '경쟁사' : '토픽'} 이름 검색`}
            className="pl-8"
          />
        </div>

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</p>
          ) : visibleOptions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">일치하는 관심사가 없습니다.</p>
          ) : visibleOptions.map(option => {
            const key = optionKey(activeTab, option.id)
            const selected = isSelected(key)
            return (
              <button
                key={key}
                type="button"
                disabled={pendingKeys.includes(key)}
                onClick={() => void toggleOption(option.id, option.label)}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:opacity-50',
                  selected
                    ? 'bg-brand-600/10 font-medium text-brand-600'
                    : 'text-foreground hover:bg-accent',
                )}
                aria-pressed={selected}
              >
                <span className="truncate">{option.label}</span>
                {selected ? <Check className="h-4 w-4 shrink-0" /> : null}
              </button>
            )
          })}
        </div>

        {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}
      </DialogContent>
    </Dialog>
  )
}
