import type { Metadata } from 'next'
import Link from 'next/link'
import BackLink from '@/components/BackLink'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { Network } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ENTITY_TYPE_LABEL, CONTENT_CATEGORY_LABEL, type EntityType, type ContentCategory } from '@/lib/types'
import EntityEventTimeline, {
  EntityEventGenerateButton,
  type EntityEventItem,
} from '@/components/entities/EntityEventTimeline'
import IssueSentimentTrend, { type SentimentDay } from '@/components/issues/IssueSentimentTrend'
import PageContainer from '@/components/PageContainer'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface EntityRow {
  id: string
  canonical_name: string
  entity_type: EntityType
  description: string | null
  is_competitor: boolean
  mention_count: number
}

interface AliasRow {
  alias: string
}

interface ContentRow {
  id: string
  title: string
  category: ContentCategory
  published_at: string | null
  collected_at: string
  sentiment: '긍정' | '중립' | '부정' | null
  sources: { name: string } | null
}

interface RelatedEntityRow {
  id: string
  canonical_name: string
  entity_type: EntityType
  is_competitor: boolean
}

interface IssueRow {
  id: string
  title: string
}

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

function getKstDateKey(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

function getKstDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function createSupabaseClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
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
}

const ENTITY_TYPE_STYLE: Record<EntityType, string> = {
  company:  'border-brand-200 bg-brand-50 text-brand-700',
  tech:     'border-blue-200 bg-blue-50 text-blue-700',
  product:  'border-violet-200 bg-violet-50 text-violet-700',
  person:   'border-emerald-200 bg-emerald-50 text-emerald-700',
  policy:   'border-amber-200 bg-amber-50 text-amber-700',
  industry: 'border-border bg-muted text-muted-foreground',
}

function entityStyle(type: EntityType, isCompetitor: boolean): string {
  if (type === 'company' && isCompetitor) return 'border-red-200 bg-red-50 text-red-700'
  return ENTITY_TYPE_STYLE[type]
}

interface SignalSummaryRow {
  signal_count: number
  content_count: number
  signal_types: string[] | null
  last_seen: string | null
}

/** 231 — entity_signal_summary 뷰 미존재 시 graceful(null). id 만 의존, 독립 쿼리. */
async function loadSignalSummary(
  supabase: ReturnType<typeof createSupabaseClient>,
  id: string
): Promise<SignalSummaryRow | null> {
  try {
    const { data } = await supabase
      .from('entity_signal_summary')
      .select('signal_count, content_count, signal_types, last_seen')
      .eq('entity_id', id)
      .maybeSingle()
    return data ? (data as unknown as SignalSummaryRow) : null
  } catch {
    return null
  }
}

/** 231 — entity_events 테이블 미존재 시 graceful([]). id 만 의존, 독립 쿼리. */
async function loadEntityEvents(
  supabase: ReturnType<typeof createSupabaseClient>,
  id: string
): Promise<EntityEventItem[]> {
  try {
    const { data: evData, error: evError } = await supabase
      .from('entity_events')
      .select('id, event_date, signal_type, headline, detail, sentiment, citations')
      .eq('entity_id', id)
      .order('event_date', { ascending: false })
      .limit(30)

    if (evError) {
      if (evError.code !== '42703' && !evError.message?.includes('does not exist')) {
        console.error('[EntityDetailPage] entity_events 조회 오류:', evError.message)
      }
      return []
    }

    return (evData ?? []).map((row: {
      id: string
      event_date: string
      signal_type: string | null
      headline: string
      detail: string | null
      sentiment: '긍정' | '중립' | '부정' | null
      citations: string[] | null
    }) => ({
      id: row.id,
      event_date: row.event_date,
      signal_type: row.signal_type,
      headline: stripLlmArtifacts(row.headline),
      detail: row.detail ? stripLlmArtifacts(row.detail) : row.detail,
      sentiment: row.sentiment,
      citations: Array.isArray(row.citations) ? row.citations : [],
    }))
  } catch (err) {
    console.error('[EntityDetailPage] entity_events 예외:', err instanceof Error ? err.message : String(err))
    return []
  }
}

function computeTrend(data: SentimentDay[]): '개선' | '악화' | '유지' {
  if (data.length < 2) return '유지'
  const half = Math.floor(data.length / 2)
  const recent = data.slice(0, half)
  const prev = data.slice(half)
  const score = (days: SentimentDay[]) =>
    days.reduce((s, d) => s + d.긍정 - d.부정, 0)
  const recentScore = score(recent)
  const prevScore = score(prev)
  if (recentScore > prevScore) return '개선'
  if (recentScore < prevScore) return '악화'
  return '유지'
}

// ─── 메타데이터 ───────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const cookieStore = await cookies()
  const supabase = createSupabaseClient(cookieStore)

  const { data } = await supabase
    .from('entities')
    .select('canonical_name')
    .eq('id', id)
    .single()

  const name = data?.canonical_name ?? '엔티티 상세'
  return {
    title: `${name} | 관계지도 | Insight Out`,
    description: `${name} 관련 콘텐츠, 이슈, 연관 엔티티`,
  }
}

// ─── 페이지 ───────────────────────────────────────────────────────────────────

export default async function EntityDetailPage({ params }: PageProps) {
  const { id } = await params
  const cookieStore = await cookies()
  const supabase = createSupabaseClient(cookieStore)

  // 1. 서로 독립인 쿼리(엔티티 자체 id 에만 의존) — 231: 한 배치로 병렬화
  const [
    { data: { user } },
    { data: entity, error: entityError },
    { data: aliasData },
    { data: ceData },
    signalSummary,
    entityEvents,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('entities')
      .select('id, canonical_name, entity_type, description, is_competitor, mention_count')
      .eq('id', id)
      .single(),
    supabase
      .from('entity_aliases')
      .select('alias')
      .eq('entity_id', id),
    supabase
      .from('content_entities')
      .select('content_id')
      .eq('entity_id', id)
      .limit(200),
    loadSignalSummary(supabase, id),
    loadEntityEvents(supabase, id),
  ])

  if (entityError || !entity) {
    notFound()
  }

  const e = entity as EntityRow
  const aliases: AliasRow[] = (aliasData ?? []) as AliasRow[]
  const contentIds: string[] = (ceData ?? []).map((r: { content_id: string }) => r.content_id)

  // 2. contentIds/user 에 의존하는 쿼리 — 서로 독립이므로 한 배치로 병렬화
  const [profileRes, contentsRes, coRes, icRes] = await Promise.all([
    user
      ? supabase.from('users').select('role').eq('id', user.id).single()
      : Promise.resolve({ data: null as { role: string } | null }),
    contentIds.length > 0
      ? supabase
          .from('contents')
          .select('id, title, category, published_at, collected_at, sentiment, sources(name)')
          .in('id', contentIds)
          .eq('status', 'published')
          .order('collected_at', { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as unknown[] }),
    contentIds.length > 0
      ? supabase
          .from('content_entities')
          .select('entity_id, entities(id, canonical_name, entity_type, is_competitor)')
          .in('content_id', contentIds)
          .neq('entity_id', id)
          .limit(1000)
      : Promise.resolve({ data: [] as unknown[] }),
    contentIds.length > 0
      ? supabase
          .from('issue_contents')
          .select('issue_id')
          .in('content_id', contentIds)
          .limit(500)
      : Promise.resolve({ data: [] as { issue_id: string }[] }),
  ])

  const isAdmin = profileRes.data?.role === 'admin'
  const contents = (contentsRes.data ?? []) as unknown as ContentRow[]

  // 3. 카테고리별 집계
  const categoryMap = new Map<ContentCategory, ContentRow[]>()
  for (const c of contents) {
    if (!categoryMap.has(c.category)) categoryMap.set(c.category, [])
    categoryMap.get(c.category)!.push(c)
  }

  // 4. 타임라인 그룹 (상위 40건)
  const timelineContents = contents.slice(0, 40)
  const timelineGroups = new Map<string, ContentRow[]>()
  for (const c of timelineContents) {
    const key = getKstDateKey(c.collected_at)
    if (!timelineGroups.has(key)) timelineGroups.set(key, [])
    timelineGroups.get(key)!.push(c)
  }

  // 5. 관련 엔티티 (co-occurrence)
  const relatedEntityMap = new Map<string, { count: number; entity: RelatedEntityRow }>()
  for (const row of (coRes.data ?? []) as unknown as { entity_id: string; entities: RelatedEntityRow | null }[]) {
    if (!row.entities) continue
    const eid = row.entity_id
    if (relatedEntityMap.has(eid)) {
      relatedEntityMap.get(eid)!.count += 1
    } else {
      relatedEntityMap.set(eid, { count: 1, entity: row.entities })
    }
  }

  const relatedEntities = [...relatedEntityMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)

  // 6. 관련 이슈 — icRes 로 집계 후 topIssueIds 로 2차(의존) 쿼리
  let relatedIssues: IssueRow[] = []
  const issueCountMap = new Map<string, number>()
  for (const row of (icRes.data ?? []) as { issue_id: string }[]) {
    issueCountMap.set(row.issue_id, (issueCountMap.get(row.issue_id) ?? 0) + 1)
  }

  if (issueCountMap.size > 0) {
    const topIssueIds = [...issueCountMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([issueId]) => issueId)

    const { data: issueData } = await supabase
      .from('issues')
      .select('id, title')
      .in('id', topIssueIds)
      .eq('status', 'published')

    relatedIssues = (issueData ?? []) as IssueRow[]
  }

  // 7. 논조 분포
  const sentimentCount = { 긍정: 0, 중립: 0, 부정: 0 }
  for (const c of contents) {
    if (c.sentiment === '긍정') sentimentCount['긍정'] += 1
    else if (c.sentiment === '부정') sentimentCount['부정'] += 1
    else sentimentCount['중립'] += 1
  }
  const totalSentiment = contents.length

  // 8. 논조 추세 (일자별 집계, 최근 30일)
  const sentimentDayMap = new Map<string, SentimentDay>()
  for (const c of contents) {
    const dateKey = getKstDateKey(c.collected_at)
    if (!sentimentDayMap.has(dateKey)) {
      sentimentDayMap.set(dateKey, { date: dateKey, 긍정: 0, 중립: 0, 부정: 0 })
    }
    const day = sentimentDayMap.get(dateKey)!
    if (c.sentiment === '긍정') day.긍정++
    else if (c.sentiment === '부정') day.부정++
    else day.중립++
  }
  const sentimentTrendData: SentimentDay[] = [...sentimentDayMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-30)
    .map(([, v]) => v)

  const sentimentTrend = computeTrend(sentimentTrendData)

  const typeStyle = entityStyle(e.entity_type, e.is_competitor)
  const typeLabel = ENTITY_TYPE_LABEL[e.entity_type]

  return (
    <PageContainer className="py-8 sm:px-6 lg:px-8">

      {/* 뒤로가기 */}
      <div className="mb-6">
        <BackLink
          fallbackHref="/dashboard/entities"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-brand-600"
        />
      </div>

      {/* 헤더 */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Network className="h-5 w-5 text-brand-600 shrink-0" />
          <h1 className="text-2xl font-bold text-foreground">{e.canonical_name}</h1>
          <span className={cn(
            'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
            typeStyle,
          )}>
            {typeLabel}
            {e.is_competitor && e.entity_type === 'company' && ' · 경쟁사'}
          </span>
        </div>

        {e.description && (
          <p className="max-w-3xl text-sm text-muted-foreground leading-relaxed mb-3">{e.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>언급 {e.mention_count.toLocaleString()}건</span>
          <span>수집 콘텐츠 {contents.length}건</span>
        </div>

        {/* 동의어 */}
        {aliases.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {aliases.map((a) => (
              <span
                key={a.alias}
                className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground"
              >
                {a.alias}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 사건 타임라인 */}
      <section className="mb-8">
        <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-foreground">사건 타임라인</h2>
          {isAdmin && <EntityEventGenerateButton entityId={id} />}
        </div>
        {entityEvents.length > 0 ? (
          <EntityEventTimeline events={entityEvents} />
        ) : (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {isAdmin
              ? '사건 타임라인을 생성하려면 위 버튼을 클릭하세요.'
              : '아직 사건 타임라인이 생성되지 않았습니다.'}
          </div>
        )}
      </section>

      {/* 시그널 요약 */}
      {signalSummary && (signalSummary.signal_types ?? []).length > 0 && (
        <section className="mb-8 rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">시그널 요약</h2>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {(signalSummary.signal_types ?? []).map(sig => (
              <span
                key={sig}
                className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700"
              >
                {sig}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>시그널 {signalSummary.signal_count.toLocaleString()}건</span>
            <span>콘텐츠 {signalSummary.content_count.toLocaleString()}건</span>
            {signalSummary.last_seen && (
              <span>최근 {new Date(signalSummary.last_seen).toLocaleDateString('ko-KR', {
                timeZone: 'Asia/Seoul', month: 'short', day: 'numeric',
              })}</span>
            )}
          </div>
        </section>
      )}

      {/* 논조 추세 차트 (IssueSentimentTrend 재사용) */}
      {sentimentTrendData.length > 1 && (
        <section className="mb-8 rounded-xl border border-border bg-card p-5">
          <IssueSentimentTrend data={sentimentTrendData} trend={sentimentTrend} />
        </section>
      )}

      {/* 관련 엔티티 (co-occurrence) */}
      {relatedEntities.length > 0 && (
        <section className="mb-8 rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">관련 엔티티</h2>
          <div className="flex flex-wrap gap-1.5">
            {relatedEntities.map(({ entity: re, count }) => (
              <Link
                key={re.id}
                href={`/dashboard/entities/${re.id}`}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-75',
                  entityStyle(re.entity_type, re.is_competitor),
                )}
                title={`${count}건 공기출현`}
              >
                <span className="opacity-60">{ENTITY_TYPE_LABEL[re.entity_type]}</span>
                {re.canonical_name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 논조 분포 */}
      {totalSentiment > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-foreground">논조 분포</h2>
          <div className="flex items-center gap-4 flex-wrap">
            {(['긍정', '중립', '부정'] as const).map((s) => {
              const count = sentimentCount[s]
              const pct = Math.round((count / totalSentiment) * 100)
              return (
                <div key={s} className="flex items-center gap-1.5">
                  <span className={cn(
                    'rounded px-1.5 py-0.5 text-[11px] font-medium',
                    s === '긍정' && 'bg-positive-soft text-positive',
                    s === '중립' && 'bg-muted text-muted-foreground',
                    s === '부정' && 'bg-negative-soft text-negative',
                  )}>
                    {s}
                  </span>
                  <span className="text-xs text-muted-foreground">{count}건 ({pct}%)</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 관련 이슈 */}
      {relatedIssues.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-foreground">관련 이슈</h2>
          <div className="flex flex-wrap gap-2">
            {relatedIssues.map((issue) => (
              <Link
                key={issue.id}
                href={`/dashboard/issues/${issue.id}`}
                className="inline-flex items-center rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-brand-600/40 hover:text-brand-600"
              >
                {stripLlmArtifacts(issue.title)}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 카테고리별 콘텐츠 */}
      {categoryMap.size > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-foreground">카테고리별 콘텐츠</h2>
          <div className="space-y-4">
            {[...categoryMap.entries()].map(([cat, items]) => (
              <div key={cat}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {CONTENT_CATEGORY_LABEL[cat] ?? cat}
                  </span>
                  <span className="text-xs text-muted-foreground/60">{items.length}건</span>
                </div>
                <div className="space-y-1.5">
                  {items.slice(0, 3).map((c) => (
                    <Link
                      key={c.id}
                      href={`/dashboard/contents/${c.id}`}
                      prefetch={false}
                      className="block rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground transition-colors hover:border-brand-600/40 hover:text-brand-600"
                    >
                      <span className="line-clamp-1">{c.title}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 최근 콘텐츠 타임라인 */}
      {timelineGroups.size > 0 ? (
        <section className="mb-8">
          <h2 className="mb-4 text-sm font-semibold text-foreground">최근 콘텐츠 타임라인</h2>
          <div className="space-y-8">
            {[...timelineGroups.entries()].map(([dateKey, items]) => (
              <div key={dateKey}>
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-sm font-medium text-muted-foreground">
                    {getKstDateLabel(items[0].collected_at)}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <ul className="space-y-3">
                  {items.map((c) => {
                    const sourceName = Array.isArray(c.sources)
                      ? (c.sources as { name: string }[])[0]?.name
                      : c.sources?.name
                    const displayAt = c.published_at ?? c.collected_at
                    const dateStr = new Date(displayAt).toLocaleDateString('ko-KR', {
                      timeZone: 'Asia/Seoul',
                      month: 'short',
                      day: 'numeric',
                    })
                    return (
                      <li key={c.id} className="rounded-xl border border-border bg-card p-4 space-y-1.5">
                        <div className="flex items-start gap-2">
                          {c.sentiment && (
                            <span className={cn(
                              'mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none',
                              c.sentiment === '긍정' && 'bg-positive-soft text-positive',
                              c.sentiment === '중립' && 'bg-muted text-muted-foreground',
                              c.sentiment === '부정' && 'bg-negative-soft text-negative',
                            )}>
                              {c.sentiment}
                            </span>
                          )}
                          <Link
                            href={`/dashboard/contents/${c.id}`}
                            prefetch={false}
                            className="text-sm font-medium text-foreground leading-snug hover:text-brand-600 transition-colors"
                          >
                            {c.title}
                          </Link>
                        </div>
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
      ) : (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          아직 수집된 콘텐츠가 없습니다.
        </div>
      )}
    </PageContainer>
  )
}
