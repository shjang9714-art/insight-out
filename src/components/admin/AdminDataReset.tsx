'use client'

import { useEffect, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAdminConfirm } from '@/components/admin/ui/AdminConfirm'

interface ResetItemConfig {
  key: string
  title: string
  description: string
  purgeUrl: string
  confirmLabel: (count: number) => string
  resultLabel: (deleted: number) => string
}

const RESET_ITEMS: ResetItemConfig[] = [
  {
    key: 'contents',
    title: '수집 기사 삭제',
    description: '크롤링으로 수집한 기사만 삭제합니다. 업로드한 리포트·AI 보고서·유튜브 영상은 보존됩니다.',
    purgeUrl: '/api/admin/contents/purge',
    confirmLabel: (count) =>
      `크롤링 기사 ${count.toLocaleString()}건을 삭제합니다.\n업로드한 리포트·AI보고서·유튜브는 보존됩니다.\n되돌릴 수 없습니다.`,
    resultLabel: (deleted) => `${deleted.toLocaleString()}건 삭제 완료`,
  },
  {
    key: 'youtube',
    title: '유튜브 영상 삭제',
    description: '수집된 유튜브 영상 전체를 삭제합니다.',
    purgeUrl: '/api/admin/youtube/purge',
    confirmLabel: (count) =>
      `유튜브 영상 ${count.toLocaleString()}건을 삭제합니다.\n되돌릴 수 없습니다.`,
    resultLabel: (deleted) => `유튜브 ${deleted.toLocaleString()}건 삭제 완료`,
  },
  {
    key: 'job_runs',
    title: '작업 이력 정리',
    description: '90일 초과된 작업 이력(job_runs)만 삭제합니다. 최근 이력은 보존됩니다.',
    purgeUrl: '/api/admin/job-runs/cleanup',
    confirmLabel: (count) =>
      `90일 초과 작업 이력 ${count.toLocaleString()}건을 삭제합니다.\n되돌릴 수 없습니다.`,
    resultLabel: (deleted) => `작업 이력 ${deleted.toLocaleString()}건 삭제 완료`,
  },
]

type Phase = 'idle' | 'confirming' | 'working'

interface ItemState {
  count: number | null
  countLoading: boolean
  phase: Phase
  result: string | null
  error: string | null
}

function initialItemState(): ItemState {
  return { count: null, countLoading: true, phase: 'idle', result: null, error: null }
}

export default function AdminDataReset() {
  const confirm = useAdminConfirm()
  const [states, setStates] = useState<Record<string, ItemState>>(() =>
    Object.fromEntries(RESET_ITEMS.map((item) => [item.key, initialItemState()]))
  )

  useEffect(() => {
    let cancelled = false
    RESET_ITEMS.forEach((item) => {
      fetch(item.purgeUrl)
        .then((res) => res.json())
        .then((data: { count?: number; error?: string }) => {
          if (cancelled) return
          setStates((prev) => ({
            ...prev,
            [item.key]: {
              ...prev[item.key],
              countLoading: false,
              count: data.count ?? null,
              error: data.count === undefined ? (data.error ?? '건수 조회에 실패했습니다.') : null,
            },
          }))
        })
        .catch(() => {
          if (cancelled) return
          setStates((prev) => ({
            ...prev,
            [item.key]: { ...prev[item.key], countLoading: false, error: '건수 조회에 실패했습니다.' },
          }))
        })
    })
    return () => {
      cancelled = true
    }
  }, [])

  const executeDelete = async (item: ResetItemConfig) => {
    setStates((prev) => ({ ...prev, [item.key]: { ...prev[item.key], phase: 'working', error: null } }))
    try {
      const res = await fetch(item.purgeUrl, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '삭제에 실패했습니다.')

      const deleted = data.deleted as number
      setStates((prev) => ({
        ...prev,
        [item.key]: {
          ...prev[item.key],
          phase: 'idle',
          count: 0,
          result: item.resultLabel(deleted),
        },
      }))
    } catch (err) {
      setStates((prev) => ({
        ...prev,
        [item.key]: {
          ...prev[item.key],
          phase: 'idle',
          error: err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.',
        },
      }))
    }
  }

  const requestConfirm = async (item: ResetItemConfig, state: ItemState) => {
    setStates((prev) => ({ ...prev, [item.key]: { ...prev[item.key], phase: 'confirming', error: null } }))
    const accepted = await confirm({
      title: item.title,
      description: item.description,
      targets: [item.title],
      loadCount: async () => state.count ?? 0,
      confirmLabel: '정말 삭제',
      destructive: true,
    })
    if (accepted) await executeDelete(item)
    else setStates((prev) => ({ ...prev, [item.key]: { ...prev[item.key], phase: 'idle' } }))
  }

  return (
    <div className="space-y-4">
      {RESET_ITEMS.map((item) => {
        const state = states[item.key]
        return (
          <div key={item.key} className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="admin-card-title text-foreground">{item.title}</p>
                <p className="admin-caption mt-1 max-w-lg text-muted-foreground">{item.description}</p>
                <p className="admin-caption mt-2 text-muted-foreground">
                  {state.countLoading
                    ? '건수 조회 중...'
                    : state.count !== null
                      ? `삭제 대상: ${state.count.toLocaleString()}건`
                      : '건수를 조회할 수 없습니다.'}
                </p>
              </div>

              {(
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={state.phase === 'working' || !state.count}
                  onClick={() => requestConfirm(item, state)}
                  className="shrink-0 border-destructive/40 text-destructive hover:border-destructive/60 hover:bg-destructive/10"
                >
                  {state.phase === 'working'
                    ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />삭제 중...</>
                    : <><Trash2 className="mr-1.5 h-3.5 w-3.5" />삭제</>
                  }
                </Button>
              )}
            </div>

            {state.result && (
              <p className="admin-caption mt-3 text-positive">✅ {state.result}</p>
            )}
            {state.error && (
              <p className="admin-caption mt-3 text-destructive">{state.error}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
