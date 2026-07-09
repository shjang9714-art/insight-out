import Link from 'next/link'
import { ArrowUpRight, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import type { KeyInsightRow } from '@/lib/key-insights/types'

const HOME_CARD_LIMIT = 3

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────
// 홈 "주목하세요, 핵심 Insight" 3카드 — key_insights(published + featured 우선) 소스.
// (구) briefings.highlights 기반 TodayBriefingHighlights 를 대체(§4, 2026-07-09).
// 모닝브리핑 자체(스크립트·오디오·generateHighlights)는 이 교체와 무관 — 그대로 유지.

export default async function KeyInsightHomeHighlights() {
  const supabase = await createClient()

  // 최신 게시 주차 1건
  const { data: weekRows } = await supabase
    .from('key_insights')
    .select('week_of')
    .eq('status', 'published')
    .order('week_of', { ascending: false })
    .limit(1)

  const weekOf = weekRows?.[0]?.week_of as string | undefined
  if (!weekOf) return null

  // featured 우선, 부족하면 display_order 상위로 채움(§3 폴백)
  const { data: rows } = await supabase
    .from('key_insights')
    .select('*')
    .eq('week_of', weekOf)
    .eq('status', 'published')
    .order('is_featured', { ascending: false })
    .order('display_order', { ascending: true, nullsFirst: false })
    .limit(HOME_CARD_LIMIT)

  const cards = (rows ?? []) as KeyInsightRow[]
  if (cards.length === 0) return null

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-6">
      {/* 마스트헤드 — 사내 전략 저널 톤. "보러가기" 링크는 여기 1개만(카드별 중복 제거). */}
      <div className="mb-5 border-b-2 border-foreground/80 pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold text-foreground">주목하세요, 핵심 Insight</h2>
          <Link
            href="/dashboard/issues?view=brief"
            className="group inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-brand-700"
          >
            핵심 Insight 보러가기
            <ArrowUpRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-700">
          LG U+ Strategy Brief
        </p>
      </div>

      {/* 카드 목록 — 저널 아티클 티저(카테고리 키커·헤드라인·요약). 헤어라인으로 구분. */}
      <ol className="flex flex-1 flex-col divide-y divide-border">
        {cards.map((card) => (
          <li key={card.id} className="flex flex-1 flex-col justify-center py-4 first:pt-0 last:pb-0">
            <Link
              href={`/dashboard/issues?view=brief&week=${card.week_of}&card=${card.id}`}
              className="group block"
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                {card.category && (
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700">
                    {card.category}
                  </span>
                )}
                {card.is_new && (
                  <span className="inline-flex items-center gap-0.5 rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    <Sparkles className="h-2.5 w-2.5" />
                    NEW
                  </span>
                )}
              </div>
              <h3 className="text-[17px] font-bold leading-snug tracking-tight text-foreground transition-colors group-hover:text-brand-700">
                {card.headline}
              </h3>
              <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">
                {card.summary_ko}
              </p>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}
