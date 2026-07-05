import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { Radio, ArrowUpRight, Play } from 'lucide-react'

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface HighlightItem {
  content_id: string
  insight: string
}

interface BriefingRow {
  id: string
  briefing_date: string
  title: string | null
  source_content_ids: string[] | null
  highlights: HighlightItem[] | null
}

interface ContentRow {
  id: string
  title: string
  category: string | null
  sources: { name: string } | null
}

// 카드에 렌더할 한 줄. primary = 합성 인사이트(있으면) / 없으면 기사 제목(폴백).
interface Line {
  id: string
  primary: string
  isInsight: boolean
  category: string | null
  source: string | null
}

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

function dateLabel(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────
// 최신 발행 브리핑의 '오늘의 핵심 인사이트' 3줄을 시각화.
// briefings.highlights(합성 시사점)가 있으면 그걸 쓰고, 없으면 선정 기사 제목으로 폴백.
// 재생/스크립트 상세는 우하단 플로팅 플레이어 + /dashboard/briefings 로 위임.

export default async function TodayBriefingHighlights() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) {
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  // 최신 발행 브리핑 1건
  const { data: briefingData } = await supabase
    .from('briefings')
    .select('id, briefing_date, title, source_content_ids, highlights')
    .in('status', ['published', 'archived'])
    .order('briefing_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!briefingData) return null
  const briefing = briefingData as unknown as BriefingRow

  // 합성 인사이트 우선, 없으면 선정 기사 순서로 폴백
  const rawHighlights = (briefing.highlights ?? []).filter(
    h => h && typeof h.content_id === 'string' && typeof h.insight === 'string' && h.insight.trim().length > 0
  )
  const useInsights = rawHighlights.length > 0

  const ids = (
    useInsights
      ? rawHighlights.map(h => h.content_id)
      : (briefing.source_content_ids ?? [])
  ).slice(0, 3)

  if (ids.length === 0) return null

  // 선정 기사 메타 조회 (제목·카테고리·출처)
  const { data: contentData } = await supabase
    .from('contents')
    .select('id, title, category, sources(name)')
    .in('id', ids)
    .eq('status', 'published')

  const rows = (contentData ?? []) as unknown as ContentRow[]
  const byId = new Map(rows.map(r => [r.id, r]))

  // id 순서 보존하며 렌더 라인 구성
  const lines: Line[] = []
  for (const id of ids) {
    const c = byId.get(id)
    const insight = useInsights
      ? rawHighlights.find(h => h.content_id === id)?.insight.trim()
      : undefined

    // 인사이트 모드: 기사 메타가 없어도 인사이트 문구만으로 렌더 가능
    if (insight) {
      lines.push({
        id,
        primary: insight,
        isInsight: true,
        category: c?.category ?? null,
        source: c?.sources?.name ?? null,
      })
    } else if (c) {
      lines.push({
        id,
        primary: c.title,
        isInsight: false,
        category: c.category ?? null,
        source: c.sources?.name ?? null,
      })
    }
  }

  if (lines.length === 0) return null

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-5">
      {/* 헤더 */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-brand-600" />
          <h2 className="text-sm font-semibold text-foreground">오늘의 핵심 인사이트</h2>
          <span className="text-[11px] text-muted-foreground">{dateLabel(briefing.briefing_date)}</span>
        </div>
        <Link
          href="/dashboard/briefings"
          className="text-[11px] text-brand-600 hover:underline"
        >
          브리핑 →
        </Link>
      </div>

      {/* 핵심 3줄 */}
      <ol className="flex-1 space-y-2.5">
        {lines.map((line, i) => (
          <li key={line.id}>
            <Link
              href={`/dashboard/contents/${line.id}`}
              className="group flex items-start gap-3 rounded-xl border border-border/60 bg-gradient-to-br from-brand-50/50 to-transparent px-3.5 py-3 transition-colors hover:border-brand-600/40 hover:from-brand-50"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold tabular-nums text-white">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground transition-colors group-hover:text-brand-600">
                  {line.primary}
                </p>
                {(line.category || line.source) && (
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    {line.category && <span>{line.category}</span>}
                    {line.category && line.source && <span>·</span>}
                    {line.source && <span className="truncate">{line.source}</span>}
                  </p>
                )}
              </div>
              <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-brand-600" />
            </Link>
          </li>
        ))}
      </ol>

      {/* 푸터 — 전체 브리핑 듣기 · 상세 */}
      <Link
        href="/dashboard/briefings"
        className="mt-4 flex items-center justify-center gap-1.5 rounded-xl bg-brand-50 py-2.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100"
      >
        <Play className="h-3.5 w-3.5 fill-current" />
        브리핑 전체 듣기 · 상세보기
      </Link>
    </div>
  )
}
