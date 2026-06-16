import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { getKstTodayStartIso } from '@/lib/date'
import { Badge } from '@/components/ui/badge'
import { ExternalLink } from 'lucide-react'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Raw 데이터 | 어드민 | Insight Out',
  description: '콘텐츠 원본 데이터 테이블',
}

const PAGE_SIZE = 50

const STATUS_LABEL: Record<string, string> = {
  published: '게시됨',
  pending:   '검토 대기',
  rejected:  '반려됨',
}
const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  published: 'default',
  pending:   'secondary',
  rejected:  'destructive',
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function AdminRawPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams

  const category   = typeof params.category   === 'string' ? params.category   : undefined
  const status     = typeof params.status     === 'string' ? params.status     : undefined
  const from       = typeof params.from       === 'string' ? params.from       : undefined
  const bookmarked = typeof params.bookmarked === 'string' ? params.bookmarked : undefined
  const source     = typeof params.source     === 'string' ? params.source     : undefined
  const research   = typeof params.research   === 'string' ? params.research   : undefined
  const page       = Math.max(1, parseInt(typeof params.page === 'string' ? params.page : '1') || 1)

  const todayStart = getKstTodayStartIso()

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )

  // ─── research=1 은 안내문만 ─────────────────────────────────────────────────

  if (research === '1') {
    return (
      <div className="space-y-6">
        <PageHeader />
        <FilterChips {...{ category, status, from, bookmarked, source, research, page }} />
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
          <p className="font-medium">AI 보고서 데이터 준비 중입니다.</p>
          <p className="mt-1 text-sm">Phase 3 AI 보고서 기능 출시 후 이용 가능합니다.</p>
        </div>
      </div>
    )
  }

  // ─── 쿼리 빌드 ──────────────────────────────────────────────────────────────

  const from_idx = (page - 1) * PAGE_SIZE
  const to_idx   = from_idx + PAGE_SIZE - 1

  let query = supabase
    .from('contents')
    .select(
      'id, title, category, status, collected_at, published_at, view_count, bookmark_count, original_url, sources(name)',
      { count: 'exact' }
    )
    .order('collected_at', { ascending: false })
    .range(from_idx, to_idx)

  if (category)          query = query.eq('category', category)
  if (status)            query = query.eq('status', status)
  if (from === 'today')  query = query.gte('collected_at', todayStart)
  if (bookmarked === '1') query = query.gt('bookmark_count', 0)
  if (source)            query = query.eq('source_id', source)

  const { data: rows, count, error } = await query
  const safeRows  = error ? [] : (rows ?? [])
  const safeCount = error ? 0  : (count ?? 0)

  const totalPages = Math.ceil(safeCount / PAGE_SIZE)

  // ─── 페이지 이동 URL 헬퍼 ──────────────────────────────────────────────────

  function pageUrl(p: number) {
    const parts: string[] = []
    if (category)          parts.push(`category=${encodeURIComponent(category)}`)
    if (status)            parts.push(`status=${encodeURIComponent(status)}`)
    if (from)              parts.push(`from=${encodeURIComponent(from)}`)
    if (bookmarked)        parts.push(`bookmarked=${bookmarked}`)
    if (source)            parts.push(`source=${encodeURIComponent(source)}`)
    if (p > 1)             parts.push(`page=${p}`)
    return '/admin/raw' + (parts.length ? '?' + parts.join('&') : '')
  }

  // ─── 렌더 ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader />
      <FilterChips {...{ category, status, from, bookmarked, source, research, page }} />

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          총 <span className="font-medium text-foreground">{safeCount.toLocaleString()}</span>건
          {totalPages > 1 && ` · ${page} / ${totalPages} 페이지`}
        </p>
        <Link
          href="/admin/contents"
          className="text-sm text-brand-600 hover:underline"
        >
          콘텐츠 관리에서 편집 →
        </Link>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">제목</th>
              <th className="px-3 py-3 text-left font-medium text-muted-foreground">카테고리</th>
              <th className="px-3 py-3 text-left font-medium text-muted-foreground">상태</th>
              <th className="px-3 py-3 text-left font-medium text-muted-foreground">출처</th>
              <th className="px-3 py-3 text-left font-medium text-muted-foreground">수집일</th>
              <th className="px-3 py-3 text-right font-medium text-muted-foreground">조회</th>
              <th className="px-3 py-3 text-right font-medium text-muted-foreground">북마크</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {safeRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  {error ? '쿼리 오류가 발생했습니다. 필터 값을 확인해주세요.' : '조건에 맞는 콘텐츠가 없습니다.'}
                </td>
              </tr>
            ) : (
              safeRows.map((row) => {
                const src = row.sources
                const sourceName = Array.isArray(src)
                  ? src[0]?.name
                  : (src as { name: string } | null)?.name
                const collectedAt = row.collected_at
                  ? new Date(row.collected_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
                  : '—'

                return (
                  <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                    <td className="max-w-xs px-4 py-3">
                      {row.original_url ? (
                        <a
                          href={row.original_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-foreground hover:text-brand-600 hover:underline"
                        >
                          <span className="line-clamp-2">{row.title}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                        </a>
                      ) : (
                        <span className="line-clamp-2 font-medium text-foreground">{row.title}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                      {row.category ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <Badge variant={STATUS_VARIANT[row.status] ?? 'secondary'}>
                        {STATUS_LABEL[row.status] ?? row.status}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                      {sourceName ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                      {collectedAt}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-muted-foreground">
                      {(row.view_count ?? 0).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-muted-foreground">
                      {(row.bookmark_count ?? 0).toLocaleString()}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={pageUrl(page - 1)}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent"
            >
              이전
            </Link>
          )}
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={pageUrl(page + 1)}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent"
            >
              다음
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

// ─── 보조 컴포넌트 ────────────────────────────────────────────────────────────

function PageHeader() {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold text-foreground">Raw 데이터</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          필터된 콘텐츠 원본 테이블 · 클릭 시 원문 이동
        </p>
      </div>
      <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
        ← 어드민 홈
      </Link>
    </div>
  )
}

interface ChipProps {
  category?: string; status?: string; from?: string
  bookmarked?: string; source?: string; research?: string; page: number
}

function FilterChips({ category, status, from, bookmarked, source, research }: ChipProps) {
  const chips: { label: string; removeUrl: string }[] = []

  function buildUrl(exclude: string) {
    const parts: string[] = []
    if (category   && exclude !== 'category')   parts.push(`category=${encodeURIComponent(category)}`)
    if (status     && exclude !== 'status')     parts.push(`status=${encodeURIComponent(status)}`)
    if (from       && exclude !== 'from')       parts.push(`from=${encodeURIComponent(from)}`)
    if (bookmarked && exclude !== 'bookmarked') parts.push(`bookmarked=${bookmarked}`)
    if (source     && exclude !== 'source')     parts.push(`source=${encodeURIComponent(source)}`)
    if (research   && exclude !== 'research')   parts.push(`research=${research}`)
    return '/admin/raw' + (parts.length ? '?' + parts.join('&') : '')
  }

  if (category)          chips.push({ label: `카테고리: ${category}`, removeUrl: buildUrl('category') })
  if (status)            chips.push({ label: `상태: ${STATUS_LABEL[status] ?? status}`, removeUrl: buildUrl('status') })
  if (from === 'today')  chips.push({ label: '오늘 수집', removeUrl: buildUrl('from') })
  if (bookmarked === '1') chips.push({ label: '북마크된 콘텐츠', removeUrl: buildUrl('bookmarked') })
  if (source)            chips.push({ label: `소스: ${source.slice(0, 8)}…`, removeUrl: buildUrl('source') })
  if (research === '1')  chips.push({ label: 'AI 리서치 인용', removeUrl: buildUrl('research') })

  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <span
          key={chip.label}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground"
        >
          {chip.label}
          <Link
            href={chip.removeUrl}
            className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={`${chip.label} 필터 제거`}
          >
            ×
          </Link>
        </span>
      ))}
    </div>
  )
}
