import Link from 'next/link'
import { ChevronRight, ClipboardCheck } from 'lucide-react'
import AdminSectionHeader from '@/components/admin/ui/AdminSectionHeader'
import { cn } from '@/lib/utils'

interface Props {
  pending: number
  todayFailed: number
  sourcesToCheck: number
}

interface Tile {
  key: string
  label: string
  count: number
  unit: string
  href: string
  description: string
  urgent: boolean // true면 count > 0 일 때 risk 톤
}

export default function AdminTodoBlock({ pending, todayFailed, sourcesToCheck }: Props) {
  const tiles: Tile[] = [
    {
      key: 'pending',
      label: '검토 대기',
      count: pending,
      unit: '건',
      href: '/admin/contents?status=pending',
      description: '검토가 필요한 콘텐츠',
      urgent: false,
    },
    {
      key: 'failed',
      label: '수집 실패',
      count: todayFailed,
      unit: '건',
      href: '/admin/crawl-logs',
      description: '오늘 수집이 실패한 건수',
      urgent: true,
    },
    {
      key: 'sources',
      label: '소스 오류',
      count: sourcesToCheck,
      unit: '곳',
      href: '/admin/sources',
      description: '최근 24시간 내 오류가 발생한 소스',
      urgent: true,
    },
  ]

  const allClear = tiles.every((t) => t.count === 0)

  return (
    <section aria-labelledby="todo-heading">
      <AdminSectionHeader icon={ClipboardCheck} title="오늘 할 일" hint="검토·수집·점검을 한눈에" />

      {allClear && (
        <p className="mb-3 text-xs text-muted-foreground">오늘은 급한 작업이 없습니다.</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tiles.map((tile) => {
	          const isDone = tile.count === 0
	          const isRisk = tile.urgent && !isDone
	          return (
	            // prefetch-ok: 어드민 작업 타일 — 개수 고정, 이동 잦음
	            <Link
	              key={tile.key}
              href={tile.href}
              className="group relative flex h-full flex-col justify-between rounded-xl border border-border bg-card p-5 transition-colors hover:bg-accent"
            >
              <ChevronRight className="absolute top-4 right-4 h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
              <p className="admin-card-title pr-5 text-muted-foreground">{tile.label}</p>
              {isDone ? (
                <p className="mt-3 text-sm font-medium text-muted-foreground">없음 ✓</p>
              ) : (
                <p className="mt-3 flex items-baseline gap-1.5">
                  <span className={cn('admin-metric-dashboard', isRisk ? 'text-risk' : 'text-foreground')}>
                    {tile.count.toLocaleString()}
                  </span>
                  <span className={cn('admin-metric-unit-dashboard', isRisk ? 'text-risk' : 'text-muted-foreground')}>
                    {tile.unit}
                  </span>
                </p>
              )}
              <p className="mt-1 admin-caption text-muted-foreground">{tile.description}</p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
