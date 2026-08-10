import type { Metadata } from 'next'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import { createAdminClient } from '@/lib/supabase/admin'
import { CATEGORY_DEFS, DB_CONTENT_CATEGORIES } from '@/lib/categories'
import { ADMIN_CATEGORY_TABS } from '@/lib/admin/content-tabs'
import { cn } from '@/lib/utils'
import AdminTable, { type AdminTableColumn } from '@/components/admin/ui/AdminTable'

export const metadata: Metadata = {
  title: '분류·카테고리 | 어드민 | Insight Out',
  description: 'DB 카테고리와 사용자 화면·어드민 탭 매핑을 조회합니다.',
}

export const dynamic = 'force-dynamic'

interface MappingRow {
  dbCategory: string
  userLabel: string | null
  adminLabel: string | null
  count: number | null
  note: string | null
}

const DEPRECATED_NOTE = 'deprecated(수집 미사용) — 기존 데이터만 조회'
const ORPHAN_NOTE = '어느 화면에도 노출되지 않음'
const DEPRECATED_CATEGORIES = new Set(['가트너', 'KRG', '오피니언'])

function userLabelFor(dbCategory: string): string | null {
  const def = CATEGORY_DEFS.find((d) => (d.dbCategories as readonly string[]).includes(dbCategory))
  return def?.label ?? null
}

function adminLabelFor(dbCategory: string): string | null {
  const tab = ADMIN_CATEGORY_TABS.find((t) => (t.dbCategories as readonly string[]).includes(dbCategory))
  return tab?.label ?? null
}

async function getContentCounts(): Promise<Record<string, number | null>> {
  const counts: Record<string, number | null> = {}
  try {
    const admin = createAdminClient()
    const results = await Promise.allSettled(
      DB_CONTENT_CATEGORIES.map((category) =>
        admin.from('contents').select('id', { count: 'exact', head: true }).eq('category', category).is('deleted_at', null)
      )
    )
    DB_CONTENT_CATEGORIES.forEach((category, i) => {
      const r = results[i]
      counts[category] =
        r.status === 'fulfilled' && !r.value.error ? (r.value.count ?? 0) : null
    })
  } catch {
    DB_CONTENT_CATEGORIES.forEach((category) => { counts[category] = null })
  }
  return counts
}

export default async function AdminTaxonomyPage() {
  const counts = await getContentCounts()

  const rows: MappingRow[] = DB_CONTENT_CATEGORIES.map((dbCategory) => {
    const userLabel = userLabelFor(dbCategory)
    const adminLabel = adminLabelFor(dbCategory)
    const isOrphan = !userLabel && !adminLabel
    const note = isOrphan
      ? ORPHAN_NOTE
      : DEPRECATED_CATEGORIES.has(dbCategory)
        ? DEPRECATED_NOTE
        : null
    return { dbCategory, userLabel, adminLabel, count: counts[dbCategory] ?? null, note }
  })

  // C — 위 표에 이미 실재하는 DB enum 값(예: AI분석의 'AI보고서')은 여기서 반복하지 않는다.
  const generatedDefs = CATEGORY_DEFS
    .filter((d) => d.generated)
    .map((d) => ({
      ...d,
      unmappedDbCategories: d.dbCategories.filter(
        (c) => !(DB_CONTENT_CATEGORIES as readonly string[]).includes(c)
      ),
    }))

  const mappingColumns: AdminTableColumn<MappingRow>[] = [
    { key: 'dbCategory', header: 'DB 카테고리', cell: (row) => <span className="font-medium text-foreground">{row.dbCategory}</span> },
    { key: 'userLabel', header: '사용자 화면', cell: (row) => <span className={row.userLabel ? 'text-foreground' : 'text-muted-foreground'}>{row.userLabel ?? '—'}</span> },
    { key: 'adminLabel', header: '어드민 탭', cell: (row) => <span className={row.adminLabel ? 'text-foreground' : 'text-muted-foreground'}>{row.adminLabel ?? '—'}</span> },
    { key: 'count', header: '콘텐츠 건수', numeric: true, cell: (row) => row.count === null ? '—' : row.count.toLocaleString('ko-KR') },
    { key: 'note', header: '비고', cell: (row) => <span className={cn('text-xs', row.note === ORPHAN_NOTE ? 'font-medium text-amber-600' : 'text-muted-foreground')}>{row.note ?? '-'}</span> },
  ]

  const generatedColumns: AdminTableColumn<(typeof generatedDefs)[number]>[] = [
    { key: 'label', header: '사용자 화면', cell: (def) => <span className="font-medium text-foreground">{def.label}</span> },
    { key: 'dbCategories', header: '매핑된 dbCategories', cell: (def) => <span className="text-muted-foreground">{def.unmappedDbCategories.length > 0 ? def.unmappedDbCategories.join(', ') : '—'}</span> },
  ]

  return (
    <>
      <AdminPageHeader />

      <div className="mb-5 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">
        카테고리 정의는 코드가 단일 진실입니다(<code className="admin-caption">src/lib/categories.ts</code>). 이 화면은 조회 전용이며 편집할 수 없습니다.
      </div>

      <AdminTable
        columns={mappingColumns}
        rows={rows}
        rowKey={(row) => row.dbCategory}
        minWidth="min-w-[720px]"
        rowClassName={(row) => cn(row.note === ORPHAN_NOTE && 'bg-amber-50 dark:bg-amber-950/20')}
        state="idle"
      />

      {generatedDefs.length > 0 && (
        <div className="mt-6">
          <h2 className="admin-card-title mb-2 text-foreground">UI 전용 생성물 카테고리 (콘텐츠 테이블에 없음)</h2>
          <p className="admin-caption mb-3 text-muted-foreground">
            아래는 사용자 화면에서만 존재하는 생성물 카테고리로, 불일치가 아닙니다.
          </p>
          <AdminTable
            columns={generatedColumns}
            rows={generatedDefs}
            rowKey={(def) => def.id}
            minWidth="min-w-[480px]"
            state="idle"
          />
        </div>
      )}
    </>
  )
}
