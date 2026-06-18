import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { ArrowLeft, Radar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CONTENT_CATEGORY_LABEL, ENTITY_TYPE_LABEL, type EntityType } from '@/lib/types'

interface PageProps {
  params: Promise<{ id: string }>
}

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface IssueDetail {
  id: string
  title: string
  summary: string | null
  status: string
  match_keywords: string[]
  created_at: string
}

interface IssueContentRow {
  content_id: string
  contents: {
    id: string
    title: string
    summary_ko: string | null
    category: string | null
    published_at: string | null
    collected_at: string
    sentiment: '긍정' | '중립' | '부정' | null
    sources: { name: string } | null
  } | null
}

interface EntityFreq {
  id: string
  canonical_name: string
  entity_type: EntityType
  is_competitor: boolean
  count: number
}

interface SimilarIssue {
  id: string
  title: string
  score: number
}

// ─── KST 헬퍼 (98 패턴) ───────────────────────────────────────────────────────

function getKstDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric',
  })
}

function getKstDateKey(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

// ─── 엔티티 색상 ──────────────────────────────────────────────────────────────

const ENTITY_TYPE_COLOR: Record<EntityType, string> = {
  company:  'bg-brand-100 text-brand-700',
  tech:     'bg-blue-50 text-blue-700',
  product:  'bg-violet-50 text-violet-700',
  person:   'bg-emerald-50 text-emerald-700',
  policy:   'bg-amber-50 text-amber-700',
  industry: 'bg-muted text-muted-foreground',
}

// ─────────────────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )
  const { data } = await supabase.from('issues').select('title').eq('id', id).single()
  const title = (data as { title?: string } | null)?.title ?? '이슈'
  return {
    title: `${title} | 이슈 | Insight Out`,
    description: `${title} 관련 콘텐츠·타임라인·엔티티`,
  }
}

export default async function IssueDetailPage({ params }: PageProps) {
  const { id } = await params

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  // 이슈 조회
  const { data: issueData } = await supabase
    .from('issues')
    .select('id, title, summary, status, match_keywords, created_at')
    .eq('id', id)
    .single()

  if (!issueData) return notFound()
  const issue = issueData as unknown as IssueDetail

  // 이슈 콘텐츠 조회 (최근 200건)
  const { data: icData } = await supabase
    .from('issue_contents')
    .select('content_id, contents!inner(id, title, summary_ko, category, published_at, collected_at, sentiment, sources(name))')
    .eq('issue_id', id)
    .limit(200)

  const issueContents = (icData ?? []) as unknown as IssueContentRow[]

  const articles = issueContents
    .map(ic => ic.contents)
    .filter((c): c is NonNullable<IssueContentRow['contents']> => c !== null)
    .sort((a, b) => {
      const aDate = a.published_at ?? a.collected_at
      const bDate = b.published_at ?? b.collected_at
      return bDate.localeCompare(aDate)
    })

  // 카테고리별 집계
  const categoryCountMap: Record<string, number> = {}
  for (const a of articles) {
    const cat = a.category ?? '기타'
    categoryCountMap[cat] = (categoryCountMap[cat] ?? 0) + 1
  }

  // 논조 집계
  const sentimentCount = { 긍정: 0, 중립: 0, 부정: 0 }
  for (const a of articles) {
    if (a.sentiment) sentimentCount[a.sentiment]++
  }
  const sentimentTotal = sentimentCount.긍정 + sentimentCount.중립 + sentimentCount.부정

  // 타임라인 — 상위 40건, KST 일자별 그룹
  const timelineArticles = articles.slice(0, 40)
  const timelineGroups = new Map<string, typeof timelineArticles>()
  for (const a of timelineArticles) {
    const key = getKstDateKey(a.collected_at)
    if (!timelineGroups.has(key)) timelineGroups.set(key, [])
    timelineGroups.get(key)!.push(a)
  }

  // 관련 엔티티 — 상위 100 콘텐츠 기준 빈도순
  const contentIds = issueContents.map(ic => ic.content_id).slice(0, 100)
  let entityFreqs: EntityFreq[] = []

  if (contentIds.length > 0) {
    const { data: entData } = await supabase
      .from('content_entities')
      .select('entity_id, entities!inner(canonical_name, entity_type, is_competitor)')
      .in('content_id', contentIds)
      .limit(500)

    const entMap = new Map<string, EntityFreq>()
    for (const row of (entData ?? []) as unknown as {
      entity_id: string
      entities: { canonical_name: string; entity_type: string; is_competitor: boolean }
    }[]) {
      const eid = row.entity_id
      if (!entMap.has(eid)) {
        entMap.set(eid, {
          id: eid,
          canonical_name: row.entities.canonical_name,
          entity_type: row.entities.entity_type as EntityType,
          is_competitor: row.entities.is_competitor,
          count: 0,
        })
      }
      entMap.get(eid)!.count++
    }
    entityFreqs = [...entMap.values()].sort((a, b) => b.count - a.count).slice(0, 30)
  }

  // 유사 이슈 — 엔티티 공유도 기반
  let similarIssues: SimilarIssue[] = []
  const topEntityIds = entityFreqs.slice(0, 20).map(e => e.id)

  if (topEntityIds.length > 0) {
    // 이 엔티티들을 가진 콘텐츠 ID 집합
    const { data: sharedContentsData } = await supabase
      .from('content_entities')
      .select('content_id')
      .in('entity_id', topEntityIds)
      .limit(500)

    const sharedContentIds = [...new Set(
      (sharedContentsData ?? []).map((r: { content_id: string }) => r.content_id)
    )]

    if (sharedContentIds.length > 0) {
      // 그 콘텐츠가 속한 다른 이슈들 → issue_id별 공유 점수
      const { data: sharedIssuesData } = await supabase
        .from('issue_contents')
        .select('issue_id')
        .in('content_id', sharedContentIds)
        .neq('issue_id', id)
        .limit(1000)

      const scoreMap = new Map<string, number>()
      for (const row of (sharedIssuesData ?? []) as { issue_id: string }[]) {
        scoreMap.set(row.issue_id, (scoreMap.get(row.issue_id) ?? 0) + 1)
      }

      const topCandidates = [...scoreMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)

      if (topCandidates.length > 0) {
        const candidateIds = topCandidates.map(([issueId]) => issueId)
        const { data: candidateIssues } = await supabase
          .from('issues')
          .select('id, title')
          .in('id', candidateIds)
          .eq('status', 'published')

        similarIssues = (candidateIssues ?? [])
          .map((issue: { id: string; title: string }) => ({
            id: issue.id,
            title: issue.title,
            score: scoreMap.get(issue.id) ?? 0,
          }))
          .sort((a, b) => b.score - a.score)
      }
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      {/* 뒤로가기 */}
      <div className="mb-6">
        <Link
          href="/dashboard/ai-analysis?tab=issues"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-brand-600"
        >
          <ArrowLeft className="h-4 w-4" />
          이슈 보드로
        </Link>
      </div>

      {/* 헤더 */}
      <div className="mb-8">
        <div className="flex items-start gap-2 mb-2">
          <Radar className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
          <h1 className="text-xl font-bold text-foreground leading-snug">{issue.title}</h1>
        </div>
        {issue.summary && (
          <p className="text-sm text-muted-foreground leading-relaxed mt-2 ml-7">
            {issue.summary}
          </p>
        )}
        <div className="flex items-center gap-2 mt-3 ml-7">
          <span className={cn(
            'rounded-full px-2.5 py-0.5 text-xs font-medium',
            issue.status === 'published' ? 'bg-emerald-50 text-emerald-700' :
            issue.status === 'archived'  ? 'bg-muted text-muted-foreground' :
            'bg-amber-50 text-amber-700'
          )}>
            {issue.status === 'published' ? '활성' :
             issue.status === 'archived'  ? '보관' : '임시저장'}
          </span>
          <span className="text-xs text-muted-foreground">
            총 {articles.length}건
          </span>
        </div>
      </div>

      <div className="space-y-10">
        {/* ── 카테고리별 콘텐츠 ── */}
        {Object.keys(categoryCountMap).length > 0 && (
          <section>
            <h2 className="mb-4 text-sm font-semibold text-foreground">카테고리별 콘텐츠</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Object.entries(categoryCountMap)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, count]) => {
                  const label = CONTENT_CATEGORY_LABEL[cat as keyof typeof CONTENT_CATEGORY_LABEL] ?? cat
                  const catArticles = articles.filter(a => (a.category ?? '기타') === cat).slice(0, 3)
                  return (
                    <div key={cat} className="rounded-lg border border-border bg-card p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-muted-foreground">{label}</span>
                        <span className="text-sm font-bold text-foreground tabular-nums">{count}</span>
                      </div>
                      <ul className="space-y-1">
                        {catArticles.map(a => (
                          <li key={a.id}>
                            <Link
                              href={`/dashboard/contents/${a.id}`}
                              className="block text-[11px] text-muted-foreground leading-snug line-clamp-2 hover:text-brand-600 transition-colors"
                            >
                              {a.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
            </div>
          </section>
        )}

        {/* ── 논조 분포 ── */}
        {sentimentTotal > 0 && (
          <section>
            <h2 className="mb-4 text-sm font-semibold text-foreground">논조 분포</h2>
            <div className="flex items-center gap-4">
              {sentimentCount.긍정 > 0 && (
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                    긍정 {sentimentCount.긍정}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(sentimentCount.긍정 / sentimentTotal * 100)}%
                  </span>
                </div>
              )}
              {sentimentCount.중립 > 0 && (
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">
                    중립 {sentimentCount.중립}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(sentimentCount.중립 / sentimentTotal * 100)}%
                  </span>
                </div>
              )}
              {sentimentCount.부정 > 0 && (
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-600">
                    부정 {sentimentCount.부정}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(sentimentCount.부정 / sentimentTotal * 100)}%
                  </span>
                </div>
              )}
            </div>
            {/* 시각적 막대 */}
            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted">
              {sentimentCount.긍정 > 0 && (
                <div
                  className="bg-emerald-400"
                  style={{ width: `${sentimentCount.긍정 / sentimentTotal * 100}%` }}
                />
              )}
              {sentimentCount.중립 > 0 && (
                <div
                  className="bg-border"
                  style={{ width: `${sentimentCount.중립 / sentimentTotal * 100}%` }}
                />
              )}
              {sentimentCount.부정 > 0 && (
                <div
                  className="bg-red-300"
                  style={{ width: `${sentimentCount.부정 / sentimentTotal * 100}%` }}
                />
              )}
            </div>
          </section>
        )}

        {/* ── 관련 엔티티 ── */}
        {entityFreqs.length > 0 && (
          <section>
            <h2 className="mb-4 text-sm font-semibold text-foreground">관련 엔티티</h2>
            <div className="flex flex-wrap gap-2">
              {entityFreqs.map(e => (
                <Link
                  key={e.canonical_name}
                  href={`/dashboard/topics/${encodeURIComponent(e.canonical_name)}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs transition-colors hover:border-brand-600/40 hover:bg-accent/50"
                >
                  <span className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                    ENTITY_TYPE_COLOR[e.entity_type]
                  )}>
                    {ENTITY_TYPE_LABEL[e.entity_type]}
                  </span>
                  <span className="text-foreground">{e.canonical_name}</span>
                  <span className="text-muted-foreground tabular-nums">{e.count}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── 유사 이슈 ── */}
        {similarIssues.length > 0 && (
          <section>
            <h2 className="mb-4 text-sm font-semibold text-foreground">유사 이슈</h2>
            <div className="flex flex-col gap-2">
              {similarIssues.map(sim => (
                <Link
                  key={sim.id}
                  href={`/dashboard/issues/${sim.id}`}
                  className="group flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-brand-600/30 hover:bg-accent/40"
                >
                  <span className="text-sm text-foreground leading-snug group-hover:text-brand-600 transition-colors line-clamp-1">
                    {sim.title}
                  </span>
                  <span className="ml-4 shrink-0 text-[11px] text-muted-foreground tabular-nums">
                    공유 {sim.score}건
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── 타임라인 ── */}
        {timelineGroups.size > 0 && (
          <section>
            <h2 className="mb-4 text-sm font-semibold text-foreground">
              타임라인{timelineArticles.length < articles.length && ` (최근 ${timelineArticles.length}건)`}
            </h2>
            <div className="space-y-8">
              {[...timelineGroups.entries()].map(([dateKey, dayArticles]) => (
                <div key={dateKey}>
                  <div className="mb-3 flex items-center gap-3">
                    <span className="text-sm font-medium text-muted-foreground">
                      {getKstDateLabel(dayArticles[0].collected_at)}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <ul className="space-y-3">
                    {dayArticles.map(article => {
                      const sourceName = Array.isArray(article.sources)
                        ? (article.sources as { name: string }[])[0]?.name
                        : article.sources?.name
                      const displayAt = article.published_at ?? article.collected_at
                      const dateStr = new Date(displayAt).toLocaleDateString('ko-KR', {
                        timeZone: 'Asia/Seoul', month: 'short', day: 'numeric',
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
                                article.sentiment === '긍정' && 'bg-emerald-100 text-emerald-700',
                                article.sentiment === '중립' && 'bg-muted text-muted-foreground',
                                article.sentiment === '부정' && 'bg-red-100 text-red-700',
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
                            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
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
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 빈 상태 */}
        {articles.length === 0 && (
          <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
            아직 배정된 콘텐츠가 없습니다.
          </div>
        )}
      </div>
    </div>
  )
}
