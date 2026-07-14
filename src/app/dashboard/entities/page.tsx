import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import EntityTabs from '@/components/entities/EntityTabs'
import PageContainer from '@/components/PageContainer'
import WatchlistTabHeader from '@/components/watchlist/WatchlistTabHeader'
import { getCompetitorNewsData } from '@/lib/entities/competitor-news'
import CompetitorNewsGroups from '@/components/entities/CompetitorNewsGroups'
import LguImpactBadge from '@/components/contents/LguImpactBadge'
import { getMajorCompaniesData } from '@/lib/entities/major-companies'
import MajorCompanyGroups from '@/components/entities/MajorCompanyGroups'
import {
  getPublishedCompetitorWeeklyReports,
  getCompetitorWeeklyTimeline,
} from '@/lib/competitor-weekly/query'
import CompetitorWeeklyList from '@/components/entities/CompetitorWeeklyList'
import CompetitorWeeklyTimeline from '@/components/entities/CompetitorWeeklyTimeline'
import EntitySectionHeader from '@/components/entities/EntitySectionHeader'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '기업동향 | Insight Out',
  description: '관심기업·경쟁사 동향 및 엔티티 관계 탐색 — 기업·기술·이슈를 한눈에 확인합니다.',
}

type SearchParams = Promise<{ view?: string }>

const VALID_VIEWS = ['watchlist', 'competitor', 'trend'] as const

type ViewId = typeof VALID_VIEWS[number]

async function createSupabase() {
  const cookieStore = await cookies()
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

function EntityPanelSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="h-4 w-40 rounded bg-muted animate-pulse" />
        <div className="h-3 w-full rounded bg-muted animate-pulse" />
        <div className="h-3 w-5/6 rounded bg-muted animate-pulse" />
      </div>
      <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="space-y-3 p-4">
              <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
              <div className="h-3 w-full rounded bg-muted animate-pulse" />
              <div className="h-3 w-2/3 rounded bg-muted animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

async function WatchlistView() {
  const supabase = await createSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  // ─── 주요 기업 탭 ─────────────────────────────────────────────────────────
  // 255: curated_groups/curated_companies(253) 기반 계층(7그룹 → 대표 3~5 → 전체보기).
  const { groups: majorGroups, curatedApplied } = await getMajorCompaniesData(supabase, { userId: user?.id })
  const MAJOR_REP_COUNT = 5

  return (
    <div>
      {user && <WatchlistTabHeader />}
      {!curatedApplied ? (
        <div className="rounded-xl border border-dashed p-8 text-center space-y-2">
          <p className="text-sm font-medium text-foreground">주요 기업 데이터 준비 중입니다</p>
          <p className="text-xs text-muted-foreground">큐레이션 그룹·기업 목록이 곧 반영됩니다.</p>
        </div>
      ) : majorGroups.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center space-y-2">
          <p className="text-sm font-medium text-foreground">주요 기업 동향이 아직 없습니다</p>
          <p className="text-xs text-muted-foreground">AI 생성·승인 후 이곳에 표시됩니다.</p>
        </div>
      ) : (
        <MajorCompanyGroups
          groups={majorGroups}
          repCount={MAJOR_REP_COUNT}
          seeAllHrefBase="/dashboard/entities/major"
        />
      )}
    </div>
  )
}

async function CompetitorView() {
  const supabase = await createSupabase()
  // ─── 경쟁사 최근 뉴스 탭 ─────────────────────────────────────────────────
  // 데이터 조립은 lib/entities/competitor-news.ts 공유 헬퍼(245) — 전체 페이지와 동일 로직.
  const { competitorCount, groups: competitorGroups, overallImpactDist } = await getCompetitorNewsData(supabase)
  const COMPETITOR_SUMMARY_CAP = 6
  const hasImpactSignal = overallImpactDist['위기'] + overallImpactDist['기회'] > 0

  return (
    <div>
      {competitorCount === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          경쟁사 키워드를 등록하면 동향을 모아 보여줍니다.
        </div>
      ) : competitorGroups.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          최근 14일 경쟁사 관련 기사가 없습니다.
        </div>
      ) : (
        <div>
          {/* 344: 페이지 상단 요약 — 위기·기회만(관망은 대부분이라 신호가 아니다) */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[13px] text-muted-foreground">
            <p>최근 14일 · 경쟁사 관련 뉴스</p>
            <div className="flex items-center gap-2">
              {hasImpactSignal && (
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">LG U+ 관점</span>
                  <LguImpactBadge impact="위기" count={overallImpactDist['위기']} />
                  <LguImpactBadge impact="기회" count={overallImpactDist['기회']} />
                </div>
              )}
              {hasImpactSignal && <span aria-hidden className="text-border">·</span>}
              <Link
                href="/dashboard/entities/competitor-news"
                prefetch={false}
                className="font-medium text-foreground/70 transition-colors hover:text-brand-600"
              >
                전체 보기 →
              </Link>
            </div>
          </div>

          <CompetitorNewsGroups
            groups={competitorGroups}
            capPerGroup={COMPETITOR_SUMMARY_CAP}
            seeAllHref="/dashboard/entities/competitor-news"
          />
        </div>
      )}
    </div>
  )
}

async function CompetitorTrendView() {
  const supabase = await createSupabase()
  // ─── 경쟁사(동향) 탭 — 261: per-company 카드 나열 → 주간 종합 리포트 → 283: 카드 목록+상세 진입 ──
  const [weeklyReports, weeklyTimeline] = await Promise.all([
    getPublishedCompetitorWeeklyReports(supabase, 12),
    getCompetitorWeeklyTimeline(supabase, 12),
  ])

  return (
    <div className="space-y-11">
      <CompetitorWeeklyTimeline entries={weeklyTimeline} />

      <section>
        <EntitySectionHeader
          title="주간 종합 리포트"
          subtitle="매주 경쟁사(통신 3사 중심) 동향을 사업영역별로 종합합니다"
          meta={weeklyReports.length > 0 ? `리포트 ${weeklyReports.length}건` : undefined}
        />

        {weeklyReports.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center space-y-2">
            <p className="text-sm font-medium text-foreground">발행된 주간 리포트가 아직 없습니다.</p>
            <p className="text-xs text-muted-foreground">
              AI 생성·발행 후 이곳에 표시됩니다.
            </p>
          </div>
        ) : (
          <CompetitorWeeklyList reports={weeklyReports} />
        )}
      </section>
    </div>
  )
}

export default async function EntitiesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const raw = typeof params.view === 'string' ? params.view : ''
  const view: ViewId = (VALID_VIEWS.includes(raw as ViewId) ? raw : 'watchlist') as ViewId

  return (
    <PageContainer>
      <Suspense fallback={null}>
        <EntityTabs />
      </Suspense>

      {/* 주요 기업 탭 */}
      {view === 'watchlist' && (
        <Suspense fallback={<EntityPanelSkeleton />}>
          <WatchlistView />
        </Suspense>
      )}

      {/* 경쟁사 최근 뉴스 탭 */}
      {view === 'competitor' && (
        <Suspense fallback={<EntityPanelSkeleton />}>
          <CompetitorView />
        </Suspense>
      )}

      {/* 경쟁사(동향) 탭 — 283: 카드 목록(최근 N건) + 위기/기회 타임라인, 클릭 시 상세 진입 */}
      {view === 'trend' && (
        <Suspense fallback={<EntityPanelSkeleton />}>
          <CompetitorTrendView />
        </Suspense>
      )}
    </PageContainer>
  )
}
