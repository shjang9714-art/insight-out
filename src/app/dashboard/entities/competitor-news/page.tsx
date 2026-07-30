import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import PageContainer from '@/components/PageContainer'
import CompetitorNewsGroups from '@/components/entities/CompetitorNewsGroups'
import CompetitorNewsTabs from '@/components/entities/CompetitorNewsTabs'
import CompetitorAreaAxisView from '@/components/entities/CompetitorAreaAxisView'
import LguImpactBadge from '@/components/contents/LguImpactBadge'
import { getCompetitorNewsData } from '@/lib/entities/competitor-news'
import { getLatestPublishedCompetitorWeeklyReport } from '@/lib/competitor-weekly/query'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '경쟁사 최근 뉴스 전체보기 | Insight Out',
  description: '전 경쟁사 최근 뉴스를 통신/클라우드·플랫폼/빅테크 그룹별로 모아 봅니다.',
}

export default async function CompetitorNewsPage() {
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

  const [{ competitorCount, groups, overallImpactDist }, weeklyReport] = await Promise.all([
    getCompetitorNewsData(supabase, {
      articleQueryLimit: 300,
      articlesPerCompany: 8,
    }),
    // 467 — 사업영역별 축. 신규 조회 없음: 기존 조회 함수 재사용
    getLatestPublishedCompetitorWeeklyReport(supabase),
  ])

  return (
    <PageContainer>
      <Link
        href="/dashboard/entities?view=competitor"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand-600 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        기업동향으로 돌아가기
      </Link>

      <div className="mb-8 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">경쟁사 최근 뉴스</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">최근 14일 · 전 경쟁사 관련 뉴스</p>
        </div>
        {/* 344: 위기·기회만 — '관망'은 대부분이라 배지로 띄우면 신호를 잃는다 */}
        {(overallImpactDist['위기'] + overallImpactDist['기회'] > 0) && (
          <div className="flex items-center gap-1 text-[13px] text-muted-foreground">
            <span>LG U+ 관점</span>
            <LguImpactBadge impact="위기" count={overallImpactDist['위기']} />
            <LguImpactBadge impact="기회" count={overallImpactDist['기회']} />
          </div>
        )}
      </div>

      <CompetitorNewsTabs
        companyView={
          competitorCount === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              경쟁사 키워드를 등록하면 동향을 모아 보여줍니다.
            </div>
          ) : groups.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              최근 14일 경쟁사 관련 기사가 없습니다.
            </div>
          ) : (
            <CompetitorNewsGroups groups={groups} articlesPerCard={8} />
          )
        }
        areaView={weeklyReport ? <CompetitorAreaAxisView report={weeklyReport} /> : null}
      />
    </PageContainer>
  )
}
