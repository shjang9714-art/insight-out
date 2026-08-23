import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import PageContainer from '@/components/PageContainer'
import PageHeader from '@/components/PageHeader'
import ContentsL2Tabs from '@/components/nav/ContentsL2Tabs'
import WatchlistTabHeader from '@/components/watchlist/WatchlistTabHeader'
import { getCompetitorNewsData } from '@/lib/entities/competitor-news'
import CompetitorNewsGroups from '@/components/entities/CompetitorNewsGroups'
import LguImpactBadge from '@/components/contents/LguImpactBadge'
import { getMajorCompaniesData } from '@/lib/entities/major-companies'
import MajorCompanyGroups from '@/components/entities/MajorCompanyGroups'
import MajorCompanyWeeklyTimeline from '@/components/entities/MajorCompanyWeeklyTimeline'
import {
  getPublishedCompetitorWeeklyReports,
  getCompetitorWeeklyTimeline,
} from '@/lib/competitor-weekly/query'
import CompetitorWeeklyList from '@/components/entities/CompetitorWeeklyList'
import CompetitorWeeklyTimeline from '@/components/entities/CompetitorWeeklyTimeline'
import EntitySectionHeader from '@/components/entities/EntitySectionHeader'
import CompanyDocumentCard from '@/components/entities/CompanyDocumentCard'
import CompanyDocumentFilterBar from '@/components/entities/CompanyDocumentFilterBar'
import {
  getPublishedCompanyDocuments,
  getCompanyDocumentEntityOptions,
  getCompanyDocumentStats,
} from '@/lib/company-docs/query'
import type { CompanyDocumentType } from '@/lib/types'
import { COMPANY_DOC_TYPES } from '@/lib/company-docs/constants'
import { CONTENT_GRID_CLASS } from '@/lib/contents/card-contract'
import ListErrorState from '@/components/ui/ListErrorState'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ view?: string; entity?: string; docType?: string; week?: string }>

// view=documents(기업·기술 자료 목록)는 자료실의 "기업 공시" 탭으로 이관됐다(지시서
// 2026-08-04b) — 탭을 눌러 들어왔을 때 브라우저 탭 제목이 "기업동향"으로 뜨면
// 상단 L1 활성 탭(자료실)과 어긋나 혼란을 준다(2026-08-05 버그 리포트). view별로
// 분기해 이 화면에 맞는 제목을 낸다.
export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = await searchParams
  if (params.view === 'documents') {
    return {
      title: '기업 공시 | Insight Out',
      description: '공시·IR·기술자료 등 기업 공식 문서를 한곳에서 확인합니다.',
    }
  }
  return {
    title: '기업동향 | Insight Out',
    description: '관심기업·경쟁사 동향 및 엔티티 관계 탐색 — 기업·기술·이슈를 한눈에 확인합니다.',
  }
}

const VALID_VIEWS = ['watchlist', 'competitor', 'trend', 'documents'] as const

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
      <div className={CONTENT_GRID_CLASS}>
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

async function WatchlistView({ weekStart }: { weekStart?: string }) {
  const supabase = await createSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  // ─── 주요 기업 탭 ─────────────────────────────────────────────────────────
  // 255: curated_groups/curated_companies(253) 기반 계층(7그룹 → 대표 3~5 → 전체보기).
  const {
    groups: majorGroups,
    curatedApplied,
    loadError,
    availableWeeks,
    selectedWeek,
  } = await getMajorCompaniesData(supabase, { userId: user?.id, weekStart })
  const MAJOR_REP_COUNT = 5

  return (
    <div className="space-y-8">
      {user && <WatchlistTabHeader />}
      <MajorCompanyWeeklyTimeline
        weeks={availableWeeks}
        activeWeekStart={selectedWeek}
        hrefBase="/dashboard/entities"
        persistentParams={{ view: 'watchlist' }}
      />
      {loadError ? (
        <ListErrorState />
      ) : !curatedApplied ? (
        <div className="rounded-xl border border-dashed p-8 text-center space-y-2">
          <p className="text-sm font-medium text-foreground">주요 기업 데이터 준비 중입니다</p>
          <p className="text-xs text-muted-foreground">큐레이션 그룹·기업 목록이 곧 반영됩니다.</p>
        </div>
      ) : majorGroups.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center space-y-2">
          <p className="text-sm font-medium text-foreground">
            {selectedWeek ? '선택한 주의 주요 기업 동향이 없습니다' : '주요 기업 동향이 아직 없습니다'}
          </p>
          <p className="text-xs text-muted-foreground">
            {selectedWeek ? '다른 주를 선택하거나 해당 주 카드를 재생성해 주세요.' : 'AI 생성·승인 후 이곳에 표시됩니다.'}
          </p>
        </div>
      ) : (
        <MajorCompanyGroups
          groups={majorGroups}
          repCount={MAJOR_REP_COUNT}
          seeAllHrefBase="/dashboard/entities/major"
          weekStart={selectedWeek ?? undefined}
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
          title="경쟁사 주간 브리핑"
          subtitle="매주 경쟁사(통신 3사 중심) 동향을 사업영역별로 종합한 브리핑"
          meta={weeklyReports.length > 0 ? `브리핑 ${weeklyReports.length}건` : undefined}
        />

        {weeklyReports.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center space-y-2">
            <p className="text-sm font-medium text-foreground">발행된 경쟁사 주간 브리핑이 아직 없습니다.</p>
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

async function DocumentsView({ entityId, docType }: { entityId?: string; docType?: CompanyDocumentType }) {
  const supabase = await createSupabase()
  // 355-B — 기업·기술 자료 탭. 355-A(DART)·355-C(검토함) 승인분(review_status='none')만 노출.
  const [docs, entityOptions, stats] = await Promise.all([
    getPublishedCompanyDocuments(supabase, { entityId, docType }),
    getCompanyDocumentEntityOptions(supabase),
    getCompanyDocumentStats(supabase),
  ])

  return (
    <div>
      <EntitySectionHeader
        title="기업 공시"
        subtitle="공시·IR·기술자료 등 공식 문서를 한곳에서 확인합니다"
        meta={`총 ${stats.total}건 · 이번주 신규 ${stats.newThisWeek}건`}
      />

      {/* 자료실 L2(자료종류) 탭 — 이 화면은 자료실 L1의 "기업 공시" 탭으로 이관된
          목록이라 다른 두 목록(콘텐츠·리포트)과 동일하게 노출한다. */}
      <Suspense fallback={null}>
        <ContentsL2Tabs />
      </Suspense>

      <CompanyDocumentFilterBar entityOptions={entityOptions} />

      {docs.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center space-y-2">
          <p className="text-sm font-medium text-foreground">해당 조건의 기업자료가 아직 없습니다</p>
          <p className="text-xs text-muted-foreground">DART 공시 수집·검토 승인 후 이곳에 표시됩니다.</p>
        </div>
      ) : (
        <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
          {docs.map((doc) => (
            <CompanyDocumentCard key={doc.contentId} doc={doc} />
          ))}
        </div>
      )}
    </div>
  )
}

export default async function EntitiesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const raw = typeof params.view === 'string' ? params.view : ''
  const view: ViewId = (VALID_VIEWS.includes(raw as ViewId) ? raw : 'watchlist') as ViewId
  const entityFilter = typeof params.entity === 'string' && params.entity ? params.entity : undefined
  const weekFilter = typeof params.week === 'string' && params.week ? params.week : undefined
  const docTypeFilter = typeof params.docType === 'string' && (COMPANY_DOC_TYPES as string[]).includes(params.docType)
    ? (params.docType as CompanyDocumentType)
    : undefined

  return (
    <PageContainer>
      {/* 공통 페이지 헤더 — 기업 공시(documents)는 자료실 L1 소속이라 그쪽 헤더를 쓴다.
          /dashboard/contents/page.tsx와 완전히 동일한 title/description(지시서: 자료실
          화면 계위 통일 — 어떤 탭을 눌러도 "자료실" 헤더가 보여야 한다). */}
      {view === 'documents' ? (
        <PageHeader
          title="자료실"
          description="수집한 뉴스·리포트·영상 원문을 카테고리별로 모아 둔 자료 아카이브입니다."
        />
      ) : (
        <PageHeader
          title="기업동향"
          description="주요 경쟁사·파트너 기업의 주간 동향을 자사 관점 시사점과 함께 정리한 기업 아카이브입니다."
        />
      )}

      {/* 주요 기업 탭 */}
      {view === 'watchlist' && (
        <Suspense fallback={<EntityPanelSkeleton />}>
          <WatchlistView weekStart={weekFilter} />
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

      {/* 기업·기술 자료 탭(355-B) */}
      {view === 'documents' && (
        <Suspense fallback={<EntityPanelSkeleton />}>
          <DocumentsView entityId={entityFilter} docType={docTypeFilter} />
        </Suspense>
      )}
    </PageContainer>
  )
}
