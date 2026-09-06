'use client'

import { useEffect, useState } from 'react'
import InterestPickerDialog, {
  type SelectedInterest,
} from '@/components/interests/InterestPickerDialog'
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
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const MAX_VISIBLE = 6
const LENS_ORDER: LensKey[] = ['boost', 'only', 'all']

interface InterestRow {
  kind: 'entity' | 'topic'
  entity_id: string | null
  group_id: string | null
  created_at: string
}

interface EntityNameRow {
  id: string
  canonical_name: string
}

interface TopicNameRow {
  id: string
  name: string
}

interface SidebarItem {
  key: string
  kind: 'entity' | 'topic'
  targetId: string
  label: string
  createdAt: string
}

export default function InterestSidebar() {
  const ctx = useLensContext()
  const [activeLens, setActiveLens] = useActiveLens()
  const [selectedKeys, setSelectedKeys] = useSelectedInterests()
  const [items, setItems] = useState<SidebarItem[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)

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
        .select('kind, entity_id, group_id, created_at')
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
          ? supabase.from('keyword_groups').select('id, name').in('id', groupIds)
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
      const topicNames = new Map(
        ((topicResult.data ?? []) as TopicNameRow[]).map(topic => [topic.id, topic.name]),
      )
      const loadedItems = rows.flatMap((row): SidebarItem[] => {
        const targetId = row.kind === 'topic' ? row.group_id : row.entity_id
        const label = targetId
          ? row.kind === 'topic' ? topicNames.get(targetId) : entityNames.get(targetId)
          : null
        return targetId && label ? [{
          key: `${row.kind}:${targetId}`,
          kind: row.kind,
          targetId,
          label,
          createdAt: row.created_at,
        }] : []
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

  function handleInterestChanged(item: SelectedInterest, selected: boolean) {
    setItems(previous => selected
      ? previous.some(existing => existing.key === item.key)
        ? previous
        : [...previous, {
            key: item.key,
            kind: item.kind,
            targetId: item.targetId,
            label: item.label,
            createdAt: new Date().toISOString(),
          }]
      : previous.filter(existing => existing.key !== item.key))
  }

  function toggleSelect(key: string) {
    const isSelected = selectedKeys.includes(key)
    const next = isSelected ? selectedKeys.filter(k => k !== key) : [...selectedKeys, key]
    setSelectedKeys(next)

    if (!isSelected && activeLens === 'all') {
      setActiveLens('boost')
    } else if (isSelected && next.length === 0 && activeLens !== 'all') {
      setActiveLens('all')
    }
  }

  function handleLensChange(next: LensKey) {
    setActiveLens(next)
    if (next === 'all') setSelectedKeys([])
  }

  const hasInterests = ctx.count > 0

  const sorted = [...items].sort((a, b) => {
    const aSelected = selectedKeys.includes(a.key)
    const bSelected = selectedKeys.includes(b.key)
    if (aSelected !== bSelected) return aSelected ? -1 : 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
  const visible = sorted.slice(0, MAX_VISIBLE)

  const selectedItems: SelectedInterest[] = items.map(item => ({
    key: item.key,
    kind: item.kind,
    targetId: item.targetId,
    label: item.label,
  }))

  return (
    <div className="flex h-full flex-col border-r border-border pr-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">관심사</h2>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
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
            onClick={() => setDialogOpen(true)}
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
        onClick={() => setDialogOpen(true)}
        className="mt-2 flex items-center justify-between text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>모든 관심사 보기</span>
        <span className="tabular-nums">{ctx.count}</span>
      </button>

      <InterestPickerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        selectedItems={selectedItems}
        userId={userId}
        onInterestChanged={handleInterestChanged}
      />
    </div>
  )
}
