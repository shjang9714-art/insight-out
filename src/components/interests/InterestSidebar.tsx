'use client'

import { useEffect, useState } from 'react'
import InterestDrawer, {
  type ChangedInterest,
  type DrawerInterestItem,
} from '@/components/interests/InterestDrawer'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useActiveLens,
  useSelectedInterests,
  useLensContext,
  LENS_PRESETS,
  type LensKey,
} from '@/lib/lens'
import { toggleInterestSelection, recordInterestUse } from '@/lib/interests/selection'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const MAX_VISIBLE = 6
const LENS_ORDER: LensKey[] = ['boost', 'only', 'all']

interface InterestRow {
  kind: 'entity' | 'topic'
  entity_id: string | null
  group_id: string | null
  created_at: string
  pinned: boolean
  last_used_at: string | null
  use_count: number
}

interface EntityNameRow {
  id: string
  canonical_name: string
}

interface TopicNameRow {
  id: string
  name: string
  tag_type: string | null
}

type SidebarItem = DrawerInterestItem

export default function InterestSidebar() {
  const ctx = useLensContext()
  const [activeLens, setActiveLens] = useActiveLens()
  const [selectedKeys, setSelectedKeys] = useSelectedInterests()
  const [items, setItems] = useState<SidebarItem[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<'explore' | 'manage'>('explore')

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (!cancelled) setLoading(false)
        return
      }
      if (!cancelled) setUserId(user.id)

      const { data, error } = await supabase
        .from('user_interests')
        .select('kind, entity_id, group_id, created_at, pinned, last_used_at, use_count')
        .eq('user_id', user.id)

      if (error) {
        console.warn('[InterestSidebar] 관심사 조회 실패:', error.message)
        if (!cancelled) setLoading(false)
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
          ? supabase.from('keyword_groups').select('id, name, tag_type').in('id', groupIds)
          : Promise.resolve({ data: [], error: null }),
      ])

      if (entityResult.error || topicResult.error) {
        console.warn(
          '[InterestSidebar] 관심사 이름 조회 실패:',
          entityResult.error?.message ?? topicResult.error?.message,
        )
        if (!cancelled) setLoading(false)
        return
      }

      const entityNames = new Map(
        ((entityResult.data ?? []) as EntityNameRow[]).map(entity => [entity.id, entity.canonical_name]),
      )
      const topics = new Map(
        ((topicResult.data ?? []) as TopicNameRow[]).map(topic => [topic.id, topic]),
      )
      const loadedItems = rows.flatMap((row): SidebarItem[] => {
        const targetId = row.kind === 'topic' ? row.group_id : row.entity_id
        if (!targetId) return []
        if (row.kind === 'topic') {
          const topic = topics.get(targetId)
          if (!topic) return []
          return [{
            key: `topic:${targetId}`,
            kind: 'topic',
            targetId,
            label: topic.name,
            tagType: topic.tag_type ?? undefined,
            createdAt: row.created_at,
            pinned: row.pinned,
            lastUsedAt: row.last_used_at,
            useCount: row.use_count,
          }]
        }
        const label = entityNames.get(targetId)
        if (!label) return []
        return [{
          key: `entity:${targetId}`,
          kind: 'entity',
          targetId,
          label,
          createdAt: row.created_at,
          pinned: row.pinned,
          lastUsedAt: row.last_used_at,
          useCount: row.use_count,
        }]
      })

      if (!cancelled) {
        setItems(loadedItems)
        setLoading(false)
      }
    }

    void load()
    window.addEventListener('lens:context-changed', load)
    return () => {
      cancelled = true
      window.removeEventListener('lens:context-changed', load)
    }
  }, [])

  function handleInterestChanged(item: ChangedInterest, selected: boolean) {
    setItems(previous => selected
      ? previous.some(existing => existing.key === item.key)
        ? previous
        : [...previous, {
            key: item.key,
            kind: item.kind,
            targetId: item.targetId,
            label: item.label,
            createdAt: new Date().toISOString(),
            pinned: false,
            lastUsedAt: null,
            useCount: 0,
          }]
      : previous.filter(existing => existing.key !== item.key))
  }

  function handlePinChanged(key: string, pinned: boolean) {
    setItems(previous => previous.map(item => item.key === key ? { ...item, pinned } : item))
  }

  function toggleSelect(key: string) {
    const { nextSelectedKeys, nextLens, turnedOn } = toggleInterestSelection(key, selectedKeys, activeLens)
    setSelectedKeys(nextSelectedKeys)
    if (nextLens) setActiveLens(nextLens)
    if (turnedOn) recordInterestUse(key)
  }

  function handleLensChange(next: LensKey) {
    setActiveLens(next)
    if (next === 'all') setSelectedKeys([])
  }

  function openExplore() {
    setDrawerMode('explore')
    setDrawerOpen(true)
  }

  function openManage() {
    setDrawerMode('manage')
    setDrawerOpen(true)
  }

  const hasInterests = ctx.count > 0

  // 설계 §3 정렬 — ① 선택 ② 고정 ③ 최근 사용(내림차순, null 은 뒤로) ④ 빈도 ⑤ 등록순
  const sorted = [...items].sort((a, b) => {
    const aSelected = selectedKeys.includes(a.key)
    const bSelected = selectedKeys.includes(b.key)
    if (aSelected !== bSelected) return aSelected ? -1 : 1

    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1

    const aUsed = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : -Infinity
    const bUsed = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : -Infinity
    if (aUsed !== bUsed) return bUsed - aUsed

    if (a.useCount !== b.useCount) return b.useCount - a.useCount

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
  const visible = sorted.slice(0, MAX_VISIBLE)

  return (
    <div className="flex h-full flex-col border-r border-border pr-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">관심사</h2>
        <button
          type="button"
          onClick={openManage}
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          관리
        </button>
      </div>

      <Select
        value={hasInterests ? activeLens : 'all'}
        onValueChange={value => handleLensChange(value as LensKey)}
        disabled={!hasInterests}
      >
        <SelectTrigger size="sm" className="mb-3 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LENS_ORDER.map(key => (
            <SelectItem key={key} value={key} disabled={key !== 'all' && !hasInterests}>
              {LENS_PRESETS[key].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {loading ? (
        <p className="py-2 text-[13px] text-muted-foreground">불러오는 중...</p>
      ) : !hasInterests ? (
        <div className="space-y-2 py-2">
          <p className="text-[13px] leading-5 text-muted-foreground">
            관심사를 고르면 화면이 내게 맞춰집니다
          </p>
          <button
            type="button"
            onClick={openManage}
            className="text-[13px] font-medium text-brand-600 hover:underline"
          >
            관심사 고르기
          </button>
        </div>
      ) : (
        <div className="flex flex-col">
          {visible.map(item => {
            const selected = selectedKeys.includes(item.key)
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => toggleSelect(item.key)}
                aria-pressed={selected}
                className="flex h-8 items-center gap-2 text-left text-[13px] text-foreground"
              >
                <span
                  className={cn(
                    'h-[18px] w-[3px] shrink-0 rounded-full',
                    selected ? 'bg-brand-600' : 'bg-transparent',
                  )}
                  aria-hidden="true"
                />
                <span className={cn('truncate', selected ? 'font-semibold' : 'font-medium')}>
                  {item.label}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <button
        type="button"
        onClick={openExplore}
        className="mt-2 flex items-center justify-between text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>모든 관심사 보기</span>
        <span className="tabular-nums">{ctx.count}</span>
      </button>

      <InterestDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        initialMode={drawerMode}
        items={items}
        userId={userId}
        onInterestChanged={handleInterestChanged}
        onPinChanged={handlePinChanged}
      />
    </div>
  )
}
