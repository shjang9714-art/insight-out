import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { ArrowUpRight } from 'lucide-react'

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface HighlightItem {
  content_id: string
  keyword?: string
  insight: string
  detail?: string
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

// 카드에 렌더할 한 항목. primary = 합성 인사이트 헤드라인(있으면) / 없으면 기사 제목(폴백).
// keyword = 앞에 붙는 임팩트 태그(인사이트 모드=LLM 키워드 / 폴백 모드=카테고리).
// detail = 뒷받침 분석 2문장(인사이트 모드에서만).
interface Line {
  id: string
  primary: string
  keyword: string | null
  detail: string | null
  isInsight: boolean
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
    const hit = useInsights ? rawHighlights.find(h => h.content_id === id) : undefined
    const insight = hit?.insight.trim()

    // 인사이트 모드: 기사 메타가 없어도 인사이트 문구만으로 렌더 가능
    if (insight) {
      lines.push({
        id,
        primary: insight,
        keyword: (hit?.keyword ?? '').trim() || null,
        detail: (hit?.detail ?? '').trim() || null,
        isInsight: true,
      })
    } else if (c) {
      lines.push({
        id,
        primary: c.title,
        keyword: c.category ?? null,
        detail: null,
        isInsight: false,
      })
    }
  }

  if (lines.length === 0) return null

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-6">
      {/* 마스트헤드 — 사내 전략 저널 톤 */}
      <div className="mb-5 border-b-2 border-foreground/80 pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-serif text-lg font-bold tracking-tight text-foreground">오늘의 핵심 인사이트</h2>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{dateLabel(briefing.briefing_date)}</span>
        </div>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-700">
          LG U+ Strategy Brief
        </p>
      </div>

      {/* 인사이트 목록 — 저널 아티클 티저(키커·헤드라인·분석). 헤어라인으로 구분. */}
      <ol className="flex flex-1 flex-col divide-y divide-border">
        {lines.map((line) => (
          <li key={line.id} className="flex flex-1 flex-col justify-center py-4 first:pt-0 last:pb-0">
            <Link href={`/dashboard/contents/${line.id}`} className="group block">
              {line.keyword && (
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700">
                  {line.keyword}
                </span>
              )}
              <h3 className="font-serif text-[17px] font-bold leading-snug tracking-tight text-foreground transition-colors group-hover:text-brand-700">
                {line.primary}
              </h3>
              {line.detail && (
                <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">
                  {line.detail}
                </p>
              )}
              <span className="mt-2 inline-flex items-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors group-hover:text-brand-700">
                관련 기사 보러가기
                <ArrowUpRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}
