'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, FileText } from 'lucide-react'
import AdminTabShell from '@/components/admin/ui/AdminTabShell'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import AdminEmptyState from '@/components/admin/ui/AdminEmptyState'
import AdminFilterChip from '@/components/admin/ui/AdminFilterChip'
import ReportCreateForm from '@/components/admin/reports/ReportCreateForm'
import ReportRow, { type AdminReportListItem } from '@/components/admin/reports/ReportRow'

type Filter = 'all' | 'published' | 'unpublished'

const TABS = [
  { value: 'list',   label: '발행 콘텐츠' },
  { value: 'create', label: '리포트 생성' },
]

export default function ReportsHub() {
  const [reports, setReports] = useState<AdminReportListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const fetchList = useCallback(async (): Promise<AdminReportListItem[]> => {
    const res = await fetch('/api/admin/reports', { cache: 'no-store' })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? '목록을 불러오지 못했습니다.')
    return (json.reports ?? []) as AdminReportListItem[]
  }, [])

  const load = useCallback(async () => {
    setError(null)
    try {
      setReports(await fetchList())
    } catch (err) {
      setError(err instanceof Error ? err.message : '목록을 불러오지 못했습니다.')
    }
  }, [fetchList])

  useEffect(() => {
    let isActive = true

    async function init() {
      try {
        const data = await fetchList()
        if (isActive) setReports(data)
      } catch (err) {
        if (isActive) setError(err instanceof Error ? err.message : '목록을 불러오지 못했습니다.')
      } finally {
        if (isActive) setIsLoading(false)
      }
    }

    void init()
    return () => { isActive = false }
  }, [fetchList])

  const filtered = reports.filter((r) => {
    if (filter === 'published') return Boolean(r.published_at)
    if (filter === 'unpublished') return !r.published_at
    return true
  })

  const publishedCount = reports.filter((r) => r.published_at).length

  return (
    <AdminTabShell
      tabs={TABS}
      defaultTab="list"
      aria-label="AI 리포트 관리"
      renderContent={(tab) =>
        tab === 'list' ? (
          <div className="space-y-6">
            {error && <AdminErrorBox onDismiss={() => setError(null)}>{error}</AdminErrorBox>}

            <div className="flex flex-wrap items-center gap-2">
              <AdminFilterChip active={filter === 'all'} onClick={() => setFilter('all')} count={reports.length}>전체</AdminFilterChip>
              <AdminFilterChip active={filter === 'published'} onClick={() => setFilter('published')} count={publishedCount}>발행</AdminFilterChip>
              <AdminFilterChip active={filter === 'unpublished'} onClick={() => setFilter('unpublished')} count={reports.length - publishedCount}>미발행</AdminFilterChip>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 불러오는 중…
              </div>
            ) : filtered.length === 0 ? (
              <AdminEmptyState message="조건에 맞는 보고서가 없습니다." icon={FileText} />
            ) : (
              <div className="space-y-3">
                {filtered.map((r) => (
                  <ReportRow
                    key={r.id}
                    report={r}
                    onChanged={() => void load()}
                    onDeleted={() => void load()}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <ReportCreateForm onCreated={() => void load()} />
        )
      }
    />
  )
}
