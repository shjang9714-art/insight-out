import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { Loader2, type LucideIcon } from 'lucide-react'
import AdminEmptyState from '@/components/admin/ui/AdminEmptyState'
import { cn } from '@/lib/utils'

export type CellAlign = 'left' | 'center' | 'right'

export interface AdminTableColumn<T> {
  key: string
  header: ReactNode
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
  loading?: boolean
  empty?: { message: string; hint?: string; icon?: LucideIcon }
  rowClassName?: (row: T) => string
  onRowClick?: (row: T) => void
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
  loading = false,
  empty,
  rowClassName,
  onRowClick,
}: AdminTableProps<T>) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        불러오는 중...
      </div>
    )
  }

  if (rows.length === 0 && empty) {
    return <AdminEmptyState {...empty} />
  }

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    if (!onRowClick || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    onRowClick(row)
  }

  return (
    <div className="admin-table overflow-x-auto rounded-xl border border-border bg-card">
      <table className={cn('w-full border-collapse text-sm', minWidth)}>
        <thead>
          <tr className="border-b border-border bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {columns.map((column) => {
              const align = column.numeric ? 'right' : (column.align ?? 'left')
              return (
                <th
                  key={column.key}
                  className={cn('px-4 py-3', ALIGN_CLASS[align], column.width)}
                >
                  {column.header}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={cn(
                'transition-colors hover:bg-accent/50',
                onRowClick && 'cursor-pointer',
                rowClassName?.(row)
              )}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (event) => handleRowKeyDown(event, row) : undefined}
              role={onRowClick ? 'button' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
            >
              {columns.map((column) => {
                const align = column.numeric ? 'right' : (column.align ?? 'left')
                const content = column.cell(row)
                const renderedContent = column.numeric && typeof content === 'number'
                  ? content.toLocaleString()
                  : content

                return (
                  <td
                    key={column.key}
                    className={cn(
                      'px-4 py-3',
                      ALIGN_CLASS[align],
                      column.numeric && 'tabular-nums',
                      column.nowrap && 'admin-cell-nowrap',
                      column.truncate === true && 'admin-cell-nowrap truncate',
                      column.width
                    )}
                  >
                    {typeof column.truncate === 'number' ? (
                      <div style={truncateStyle(column.truncate)}>{renderedContent}</div>
                    ) : renderedContent}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
