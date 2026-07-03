import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { ArrowLeft, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PageProps {
  params: Promise<{ topic: string }>
}

interface TopicArticle {
  id: string
  title: string
  summary_ko: string | null
  category: string | null
  published_at: string | null
  collected_at: string
  sentiment: '긍정' | '중립' | '부정' | null
  sources: { name: string } | null
}

function getKstDateLabel(isoString: string): string {
  const d = new Date(isoString)
  return d.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function getKstDateKey(isoString: string): string {
  const d = new Date(isoString)
  // YYYY-MM-DD in KST
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { topic } = await params
  const decoded = decodeURIComponent(topic)
  return {
    title: `${decoded} 타임라인 | Insight Out`,
    description: `${decoded} 관련 기사 타임라인`,
  }
}

export default async function TopicTimelinePage({ params }: PageProps) {
  const { topic } = await params
  const decoded = decodeURIComponent(topic)

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

  const selectFields = 'id,title,summary_ko,category,published_at,collected_at,sentiment,sources(name)'

  // 2쿼리 머지 — .or의 따옴표 이슈 회피
  const [groupsRes, keywordsRes] = await Promise.all([
    supabase
      .from('contents')
      .select(selectFields)
      .eq('status', 'published')
      .contains('matched_groups', [decoded])
      .order('collected_at', { ascending: false })
      .limit(60),
    supabase
      .from('contents')
      .select(selectFields)
      .eq('status', 'published')
      .contains('matched_keywords', [decoded])
      .order('collected_at', { ascending: false })
      .limit(60),
  ])

  // dedup by id
  const seen = new Set<string>()
  const allArticles: TopicArticle[] = []
  for (const row of [...(groupsRes.data ?? []), ...(keywordsRes.data ?? [])]) {
    const r = row as unknown as TopicArticle
    if (!seen.has(r.id)) {
      seen.add(r.id)
      allArticles.push(r)
    }
  }

  // published_at desc nulls last → collected_at desc
  allArticles.sort((a, b) => {
    const aDate = a.published_at ?? a.collected_at
    const bDate = b.published_at ?? b.collected_at
    return bDate.localeCompare(aDate)
  })

  // KST 일자별 그룹핑
  const groups = new Map<string, TopicArticle[]>()
  for (const article of allArticles) {
    const key = getKstDateKey(article.collected_at)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(article)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      {/* 뒤로가기 */}
      <div className="mb-6">
        <Link
          href="/dashboard/issues"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-brand-600"
        >
          <ArrowLeft className="h-4 w-4" />
          AI 인사이트로
        </Link>
      </div>

      {/* 헤더 */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="h-5 w-5 text-brand-600" />
          <h1 className="text-xl font-bold text-foreground">{decoded}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {allArticles.length > 0
            ? `총 ${allArticles.length}건의 기사`
            : '관련 기사 없음'}
        </p>
      </div>

      {/* 빈 상태 */}
      {allArticles.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          이 토픽의 최근 기사가 없습니다.
        </div>
      )}

      {/* 일자별 타임라인 */}
      <div className="space-y-8">
        {[...groups.entries()].map(([dateKey, articles]) => (
          <section key={dateKey}>
            {/* 일자 헤더 */}
            <div className="mb-3 flex items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground">
                {getKstDateLabel(articles[0].collected_at)}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* 기사 목록 */}
            <ul className="space-y-3">
              {articles.map((article) => {
                const sourceName = Array.isArray(article.sources)
                  ? (article.sources as { name: string }[])[0]?.name
                  : article.sources?.name
                const displayAt = article.published_at ?? article.collected_at
                const dateStr = new Date(displayAt).toLocaleDateString('ko-KR', {
                  timeZone: 'Asia/Seoul',
                  month: 'short',
                  day: 'numeric',
                })

                return (
                  <li
                    key={article.id}
                    className="rounded-xl border border-border bg-card p-4 space-y-1.5"
                  >
                    <div className="flex items-start gap-2">
                      {article.sentiment && (
                        <span className={cn(
                          'mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none',
                          article.sentiment === '긍정' && 'bg-positive-soft text-positive',
                          article.sentiment === '중립' && 'bg-muted text-muted-foreground',
                          article.sentiment === '부정' && 'bg-negative-soft text-negative',
                        )}>
                          {article.sentiment}
                        </span>
                      )}
                      <Link
                        href={`/dashboard/contents/${article.id}`}
                        className="text-sm font-medium text-foreground leading-snug hover:text-brand-600 transition-colors"
                      >
                        {article.title}
                      </Link>
                    </div>
                    {article.summary_ko && (
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 pl-0">
                        {article.summary_ko}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                      {sourceName && <span>{sourceName}</span>}
                      {sourceName && <span>·</span>}
                      <span>{dateStr}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
