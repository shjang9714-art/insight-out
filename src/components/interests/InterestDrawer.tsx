'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import {
  fetchSelectableCompetitors,
  type SelectableEntity,
} from '@/lib/interests/options'
import { addInterest, removeInterest, type InterestKind } from '@/lib/interests/mutations'
import { fetchSelectableTopics, type SelectableTopic } from '@/lib/interests/topics'
import { toggleInterestSelection } from '@/lib/interests/selection'
import { useActiveLens, useSelectedInterests } from '@/lib/lens'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

export interface DrawerInterestItem {
  key: string
  kind: InterestKind
  targetId: string
  label: string
  tagType?: string
  createdAt: string
}

export interface ChangedInterest {
  key: string
  kind: InterestKind
  targetId: string
  label: string
}

type Mode = 'explore' | 'manage'
type TabKey = InterestKind

const GROUP_LABELS: Record<string, string> = {
  tech: '기술',
  industry: '산업',
  company: '기업군',
  policy: '정책',
}
const GROUP_ORDER = ['기술', '산업', '기업군', '정책', '기업', '기타']

function groupLabelFor(item: DrawerInterestItem): string {
  if (item.kind === 'entity') return '기업'
  return (item.tagType && GROUP_LABELS[item.tagType]) || '기타'
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialMode?: Mode
  items: DrawerInterestItem[]
  userId: string | null
  onInterestChanged: (item: ChangedInterest, selected: boolean) => void
}

export default function InterestDrawer({
  open,
  onOpenChange,
  initialMode = 'explore',
  items,
  userId,
  onInterestChanged,
}: Props) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [search, setSearch] = useState('')
  const [selectedKeys, setSelectedKeys] = useSelectedInterests()
  const [activeLens, setActiveLens] = useActiveLens()

  // ─── 관리 모드 상태 (경쟁사/토픽 추가·해제) ───────────────────────────
  const [activeTab, setActiveTab] = useState<TabKey>('entity')
  const [entities, setEntities] = useState<SelectableEntity[]>([])
  const [topics, setTopics] = useState<SelectableTopic[]>([])
  const [entitySearch, setEntitySearch] = useState('')
  const [topicSearch, setTopicSearch] = useState('')
  const [catalogLoaded, setCatalogLoaded] = useState(false)
  const [pendingKeys, setPendingKeys] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  // Sheet가 다시 열릴 때 탐색/관리 모드와 검색어를 초기 상태로 되돌린다
  // (렌더 도중 상태를 조정 — effect 로 하면 열릴 때마다 불필요한 추가 렌더가 생긴다).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setMode(initialMode)
      setSearch('')
      setError(null)
      setCatalogLoaded(false)
    }
  }

  const catalogLoading = mode === 'manage' && !catalogLoaded

  useEffect(() => {
    if (mode !== 'manage' || catalogLoaded) return
    let cancelled = false

    const supabase = createClient()
    Promise.all([
      fetchSelectableCompetitors(supabase),
      fetchSelectableTopics(supabase),
    ]).then(([loadedEntities, loadedTopics]) => {
      if (cancelled) return
      setEntities(loadedEntities)
      setTopics(loadedTopics)
      setCatalogLoaded(true)
    }).catch((loadError: unknown) => {
      console.warn(
        '[InterestDrawer] 선택지 조회 실패:',
        loadError instanceof Error ? loadError.message : loadError,
      )
      if (!cancelled) {
        setError('관심사 선택지를 불러오지 못했습니다.')
        setCatalogLoaded(true)
      }
    })

    return () => { cancelled = true }
  }, [mode, catalogLoaded])

  // ─── 탐색 모드 ────────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ko')
    if (!query) return items
    return items.filter(item => item.label.toLocaleLowerCase('ko').includes(query))
  }, [items, search])

  const recentItems = useMemo(() => (
    [...filteredItems]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 3)
  ), [filteredItems])

  const groupedItems = useMemo(() => {
    const groups = new Map<string, DrawerInterestItem[]>()
    for (const item of filteredItems) {
      const label = groupLabelFor(item)
      const list = groups.get(label) ?? []
      list.push(item)
      groups.set(label, list)
    }
    for (const list of groups.values()) {
      list.sort((a, b) => a.label.localeCompare(b.label, 'ko'))
    }
    return GROUP_ORDER
      .map(label => ({ label, items: groups.get(label) ?? [] }))
      .filter(group => group.items.length > 0)
  }, [filteredItems])

  function toggleSelect(key: string) {
    const { nextSelectedKeys, nextLens } = toggleInterestSelection(key, selectedKeys, activeLens)
    setSelectedKeys(nextSelectedKeys)
    if (nextLens) setActiveLens(nextLens)
  }

  // ─── 관리 모드 ────────────────────────────────────────────────────────
  const interestKeys = new Set(items.map(item => item.key))
  function catalogOptionKey(kind: InterestKind, targetId: string): string {
    return `${kind}:${targetId}`
  }
  function isInInterests(key: string): boolean {
    return interestKeys.has(key)
  }

  async function toggleCatalogOption(targetId: string, label: string) {
    const kind: InterestKind = activeTab
    const key = catalogOptionKey(kind, targetId)
    if (pendingKeys.includes(key)) return

    const nextSelected = !isInInterests(key)
    setPendingKeys(previous => [...previous, key])
    setError(null)

    const supabase = createClient()
    const resolvedUserId = userId ?? (await supabase.auth.getUser()).data.user?.id
    if (!resolvedUserId) {
      setPendingKeys(previous => previous.filter(pendingKey => pendingKey !== key))
      setError('로그인이 필요합니다.')
      return
    }

    try {
      if (nextSelected) {
        await addInterest(supabase, resolvedUserId, kind, targetId)
      } else {
        await removeInterest(supabase, resolvedUserId, kind, targetId)
        // 삭제한 관심사가 선택돼 있었다면 선택에서도 뺀다 — 안 그러면 사라진
        // 관심사가 계속 화면을 거른다.
        if (selectedKeys.includes(key)) {
          setSelectedKeys(selectedKeys.filter(existing => existing !== key))
        }
      }
      onInterestChanged({ key, kind, targetId, label }, nextSelected)
    } catch (mutationError) {
      console.warn(
        '[InterestDrawer] 관심사 변경 실패:',
        mutationError instanceof Error ? mutationError.message : mutationError,
      )
      setError(`${label} 관심사를 변경하지 못했습니다.`)
    } finally {
      setPendingKeys(previous => previous.filter(pendingKey => pendingKey !== key))
    }
  }

  const catalogQuery = (activeTab === 'entity' ? entitySearch : topicSearch).trim().toLocaleLowerCase('ko')
  const visibleCatalogOptions = activeTab === 'entity'
    ? entities
      .filter(entity => entity.canonical_name.toLocaleLowerCase('ko').includes(catalogQuery))
      .map(entity => ({ id: entity.id, label: entity.canonical_name }))
    : topics
      .filter(topic => topic.name.toLocaleLowerCase('ko').includes(catalogQuery))
      .map(topic => ({ id: topic.id, label: topic.name }))

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader className="flex-row items-center justify-between space-y-0">
          <SheetTitle>관심사</SheetTitle>
          {mode === 'explore' ? (
            <button
              type="button"
              onClick={() => setMode('manage')}
              className="mr-6 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              관심사 관리
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMode('explore')}
              className="mr-6 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              ← 돌아가기
            </button>
          )}
        </SheetHeader>

        {mode === 'explore' ? (
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="관심사 검색"
                className="pl-8"
              />
            </div>

            {items.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                아직 등록된 관심사가 없습니다.
              </p>
            ) : filteredItems.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                일치하는 관심사가 없습니다.
              </p>
            ) : (
              <>
                {recentItems.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground">최근 추가</h3>
                    <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                      {recentItems.map(item => (
                        <InterestCheckItem
                          key={item.key}
                          item={item}
                          selected={selectedKeys.includes(item.key)}
                          onToggle={() => toggleSelect(item.key)}
                        />
                      ))}
                    </div>
                    <div className="h-px bg-border" />
                  </div>
                )}

                <div className="space-y-4">
                  {groupedItems.map(group => (
                    <div key={group.label} className="space-y-2">
                      <h3 className="text-xs font-semibold text-muted-foreground">{group.label}</h3>
                      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                        {group.items.map(item => (
                          <InterestCheckItem
                            key={item.key}
                            item={item}
                            selected={selectedKeys.includes(item.key)}
                            onToggle={() => toggleSelect(item.key)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
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

            <div className="flex-1 space-y-1 overflow-y-auto">
              {catalogLoading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</p>
              ) : visibleCatalogOptions.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">일치하는 관심사가 없습니다.</p>
              ) : visibleCatalogOptions.map(option => {
                const key = catalogOptionKey(activeTab, option.id)
                const selected = isInInterests(key)
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={pendingKeys.includes(key)}
                    onClick={() => void toggleCatalogOption(option.id, option.label)}
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
          </div>
        )}

        {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}
      </SheetContent>
    </Sheet>
  )
}

function InterestCheckItem({
  item,
  selected,
  onToggle,
}: {
  item: DrawerInterestItem
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className="flex h-8 items-center gap-1.5 text-left text-[13px] text-foreground"
    >
      <span
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
          selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-border',
        )}
        aria-hidden="true"
      >
        {selected ? <Check className="h-3 w-3" /> : null}
      </span>
      <span className={cn(selected ? 'font-semibold' : 'font-medium')}>{item.label}</span>
    </button>
  )
}
