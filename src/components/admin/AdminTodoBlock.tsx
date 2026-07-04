import Link from 'next/link'
import { ClipboardCheck } from 'lucide-react'
import AdminSectionHeader from '@/components/admin/ui/AdminSectionHeader'

interface Props {
  pending: number
  todayCollected: number
  todayFailed: number
  sourcesToCheck: number
}

export default function AdminTodoBlock({ pending, todayCollected, todayFailed, sourcesToCheck }: Props) {
  const allClear = pending === 0 && todayFailed === 0 && sourcesToCheck === 0

  return (
    <section aria-labelledby="todo-heading">
      <AdminSectionHeader icon={ClipboardCheck} title="오늘 할 일" hint="검토·수집·점검을 한눈에" />

      {allClear && (
        <p className="mb-3 text-xs text-muted-foreground">오늘은 급한 작업이 없습니다.</p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* 콘텐츠 검토 */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">콘텐츠 검토</p>
          {pending > 0 ? (
            <p className="text-2xl font-bold tabular-nums text-foreground">{pending.toLocaleString()}건</p>
          ) : (
            <p className="text-sm font-medium text-muted-foreground">검토할 항목 없음 ✓</p>
          )}
          <Link
            href="/admin/contents?status=pending"
            className="inline-block text-xs font-medium text-brand-600 hover:underline"
          >
            검토하기 →
          </Link>
        </div>

        {/* 오늘 수집 */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">오늘 수집</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold tabular-nums text-foreground">{todayCollected.toLocaleString()}건</p>
            {todayFailed > 0 && (
              <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-700 tabular-nums">
                실패 {todayFailed}
              </span>
            )}
          </div>
          <Link
            href="/admin/contents?from=today"
            className="inline-block text-xs font-medium text-brand-600 hover:underline"
          >
            오늘 수집 보기 →
          </Link>
        </div>

        {/* 소스 점검 */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">소스 점검</p>
          {sourcesToCheck > 0 ? (
            <p className="text-2xl font-bold tabular-nums text-amber-600">{sourcesToCheck}곳</p>
          ) : (
            <p className="text-sm font-medium text-muted-foreground">정상 ✓</p>
          )}
          <Link
            href="/admin/sources"
            className="inline-block text-xs font-medium text-brand-600 hover:underline"
          >
            소스 목록 →
          </Link>
        </div>
      </div>
    </section>
  )
}
