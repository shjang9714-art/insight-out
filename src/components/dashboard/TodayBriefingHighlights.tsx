import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { Sparkles, ArrowRight } from 'lucide-react'

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface HighlightItem {
  content_id: string
  keyword?: string
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
// keyword = 앞에 붙는 임팩트 태그(인사이트 모드=LLM 키워드 / 폴백 모드=카테고리).
interface Line {
  id: string
  primary: string
  keyword: string | null
  isInsight: boolean
}

// 포스트잇 톤 — 인덱스별로 색과 기울기를 돌려 손으로 붙인 메모지 느낌.
const NOTE_STYLES = [
  { note: 'bg-amber-100', text: 'text-amber-950', pill: 'bg-amber-200/70 text-amber-900', link: 'text-amber-800/70', rotate: '-rotate-1' },
  { note: 'bg-rose-100', text: 'text-rose-950', pill: 'bg-rose-200/70 text-rose-900', link: 'text-rose-800/70', rotate: 'rotate-1' },
  { note: 'bg-sky-100', text: 'text-sky-950', pill: 'bg-sky-200/70 text-sky-900', link: 'text-sky-800/70', rotate: '-rotate-1' },
] as const

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
    const hit = useInsights ? rawHighlights.find(h => h.content_id === id) : undefined
    const insight = hit?.insight.trim()

    // 인사이트 모드: 기사 메타가 없어도 인사이트 문구만으로 렌더 가능
    if (insight) {
      lines.push({
        id,
        primary: insight,
        keyword: (hit?.keyword ?? '').trim() || null,
        isInsight: true,
      })
    } else if (c) {
      lines.push({
        id,
        primary: c.title,
        keyword: c.category ?? null,
        isInsight: false,
      })
    }
  }

  if (lines.length === 0) return null

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-gradient-to-b from-brand-50/40 to-card p-5">
      {/* 헤더 — LGU+ 관점 오늘의 인사이트 */}
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-brand-700 shadow-sm">
          <Sparkles className="h-3.5 w-3.5 text-white" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">오늘의 핵심 인사이트</h2>
        <span className="text-[11px] text-muted-foreground">{dateLabel(briefing.briefing_date)}</span>
      </div>

      {/* 핵심 3줄 — 포스트잇 메모지. 출처 없이 '인사이트 한 줄'만, 상단에 관련기사 링크. */}
      <ol className="flex flex-1 flex-col justify-between gap-3.5">
        {lines.map((line, i) => {
          const s = NOTE_STYLES[i % NOTE_STYLES.length]
          return (
            <li key={line.id} className="flex-1">
              <Link
                href={`/dashboard/contents/${line.id}`}
                className={`group relative flex h-full flex-col justify-center rounded-lg ${s.note} px-4 py-3 shadow-sm ring-1 ring-black/5 transition-transform duration-200 ${s.rotate} hover:rotate-0 hover:shadow-md`}
              >
                {/* 상단: 키워드 태그 + 관련 기사 보러가기 */}
                <div className="mb-2 flex items-center justify-between gap-2">
                  {line.keyword ? (
                    <span className={`inline-flex items-center rounded-md ${s.pill} px-2 py-0.5 text-[11px] font-bold tracking-tight`}>
                      {line.keyword}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span className={`flex items-center gap-0.5 whitespace-nowrap text-[10px] font-medium ${s.link} transition-opacity group-hover:opacity-100`}>
                    관련 기사 보러가기
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
                <p className={`line-clamp-3 text-[15px] font-semibold leading-snug tracking-tight ${s.text}`}>
                  {line.primary}
                </p>
              </Link>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
