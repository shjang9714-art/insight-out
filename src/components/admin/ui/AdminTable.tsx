import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, type LucideIcon } from 'lucide-react'
import AdminEmptyState from '@/components/admin/ui/AdminEmptyState'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type CellAlign = 'left' | 'center' | 'right'
export type AdminTableState = 'idle' | 'loading' | 'empty' | 'error'

export interface AdminTableColumn<T> {
  key: string
  header: ReactNode
  sortKey?: string
  align?: CellAlign
  numeric?: boolean
  nowrap?: boolean
  truncate?: boolean | number
  width?: string
  cell: (row: T) => ReactNode
}

export interface AdminTableProps<T> {
  columns: AdminTableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  minWidth?: string
  rowClassName?: (row: T) => string
  onRowClick?: (row: T) => void
  state?: AdminTableState
  emptyMessage?: string
  emptyHint?: string
  emptyIcon?: LucideIcon
  errorMessage?: string
  onRetry?: () => void
  sort?: { key: string; dir: 'asc' | 'desc' }
  onSortChange?: (key: string) => void
  pagination?: { page: number; pageSize: number; total: number | null }
  onPageChange?: (page: number) => void
  truncated?: { shown: number; total: number | null }
  selection?: { selected: Set<string>; onChange: (next: Set<string>) => void }
}

const ALIGN_CLASS: Record<CellAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

function truncateStyle(lines: number): CSSProperties {
  return {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: lines,
    overflow: 'hidden',
  }
}

export default function AdminTable<T>({
  columns,
  rows,
  rowKey,
  minWidth,
  rowClassName,
  onRowClick,
  state = 'idle',
  emptyMessage = '표시할 항목이 없습니다.',
  emptyHint,
  emptyIcon,
  errorMessage = '목록을 불러오지 못했습니다.',
  onRetry,
  sort,
  onSortChange,
  pagination,
  onPageChange,
  truncated,
  selection,
}: AdminTableProps<T>) {
  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        불러오는 중...
      </div>
    )
  }

  if (state === 'empty') {
    return <AdminEmptyState message={emptyMessage} hint={emptyHint} icon={emptyIcon} />
  }

  if (state === 'error') {
    return <AdminEmptyState variant="error" message={errorMessage} icon={emptyIcon} onRetry={onRetry} />
  }

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    if (!onRowClick || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    onRowClick(row)
  }

  const visibleKeys = rows.map(rowKey)
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((key) => selection?.selected.has(key))
  const selectedVisibleCount = visibleKeys.filter((key) => selection?.selected.has(key)).length
  const partiallySelected = selectedVisibleCount > 0 && !allVisibleSelected
  const pageStart = pagination ? (pagination.page - 1) * pagination.pageSize + (rows.length > 0 ? 1 : 0) : 0
  const pageEnd = pagination ? pageStart + rows.length - (rows.length > 0 ? 1 : 0) : 0
  const hasNextPage = pagination
    ? pagination.total === null
      ? rows.length === pagination.pageSize
      : pagination.page * pagination.pageSize < pagination.total
    : false

  const toggleAllVisible = () => {
    if (!selection) return
    const next = new Set(selection.selected)
    if (allVisibleSelected) visibleKeys.forEach((key) => next.delete(key))
    else visibleKeys.forEach((key) => next.add(key))
    selection.onChange(next)
  }

  const toggleRow = (key: string) => {
    if (!selection) return
    const next = new Set(selection.selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    selection.onChange(next)
  }

  return (
    <div className="admin-table overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className={cn('w-full border-collapse text-sm', minWidth)}>
          <thead>
            <tr className="border-b border-border bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {selection && (
                <th className="w-10 px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    aria-label="현재 페이지 전체 선택"
                    checked={allVisibleSelected}
                    ref={(node) => { if (node) node.indeterminate = partiallySelected }}
                    onChange={toggleAllVisible}
                    className="h-4 w-4 accent-brand-600"
                  />
                </th>
              )}
              {columns.map((column) => {
                const align = column.numeric ? 'right' : (column.align ?? 'left')
                const sortable = Boolean(column.sortKey && onSortChange)
                const activeSort = column.sortKey && sort?.key === column.sortKey ? sort.dir : null
                return (
                  <th
                    key={column.key}
                    aria-sort={activeSort === 'asc' ? 'ascending' : activeSort === 'desc' ? 'descending' : undefined}
                    className={cn('px-4 py-3', ALIGN_CLASS[align], column.width)}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => onSortChange?.(column.sortKey!)}
                        className={cn('inline-flex items-center gap-1 hover:text-foreground', align === 'right' && 'justify-end')}
                      >
                        {column.header}
                        {activeSort === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : activeSort === 'desc' ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />}
                      </button>
                    ) : column.header}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const key = rowKey(row)
              return (
                <tr
                  key={key}
                  className={cn('transition-colors hover:bg-accent/50', onRowClick && 'cursor-pointer', rowClassName?.(row))}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (event) => handleRowKeyDown(event, row) : undefined}
                  role={onRowClick ? 'button' : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                >
                  {selection && (
                    <td className="w-10 px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        aria-label="행 선택"
                        checked={selection.selected.has(key)}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => toggleRow(key)}
                        className="h-4 w-4 accent-brand-600"
                      />
                    </td>
                  )}
                  {columns.map((column) => {
                    const align = column.numeric ? 'right' : (column.align ?? 'left')
                    const content = column.cell(row)
                    const renderedContent = column.numeric && typeof content === 'number' ? content.toLocaleString() : content
                    return (
                      <td key={column.key} className={cn('px-4 py-3', ALIGN_CLASS[align], column.numeric && 'tabular-nums', column.nowrap && 'admin-cell-nowrap', column.truncate === true && 'admin-cell-nowrap truncate', column.width)}>
                        {typeof column.truncate === 'number' ? <div style={truncateStyle(column.truncate)}>{renderedContent}</div> : renderedContent}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {(pagination || truncated) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <div>
            {truncated ? (
              <span className="font-medium text-warning">
                {truncated.total === null ? `전체 수 미확인 · ${truncated.shown.toLocaleString()}건만 표시 — 상한에 걸렸습니다` : `${truncated.total.toLocaleString()}건 중 ${truncated.shown.toLocaleString()}건만 표시 — 상한에 걸렸습니다`}
              </span>
            ) : pagination?.total === null ? (
              `${pageStart.toLocaleString()}–${pageEnd.toLocaleString()} 표시 (전체 수 미확인)`
            ) : (
              `총 ${(pagination?.total ?? 0).toLocaleString()}건 중 ${pageStart.toLocaleString()}–${pageEnd.toLocaleString()} 표시`
            )}
          </div>
          {pagination && onPageChange && (
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" disabled={pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)}>이전</Button>
              <Button type="button" size="sm" variant="outline" disabled={!hasNextPage} onClick={() => onPageChange(pagination.page + 1)}>다음</Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
