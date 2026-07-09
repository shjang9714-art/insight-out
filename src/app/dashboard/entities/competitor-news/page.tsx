import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import PageContainer from '@/components/PageContainer'
import CompetitorNewsGroups from '@/components/entities/CompetitorNewsGroups'
import { getCompetitorNewsData } from '@/lib/entities/competitor-news'

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

  const { competitorCount, groups, overallImpactDist } = await getCompetitorNewsData(supabase, {
    articleQueryLimit: 300,
    articlesPerCompany: 8,
  })

  return (
    <PageContainer>
      <Link
        href="/dashboard/entities?view=competitor"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand-600 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        기업동향으로 돌아가기
      </Link>

      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">경쟁사 최근 뉴스</h1>
          <p className="mt-1 text-xs text-muted-foreground">최근 14일 · 전 경쟁사 관련 뉴스</p>
        </div>
        {(overallImpactDist['위기'] + overallImpactDist['기회'] + overallImpactDist['관망'] > 0) && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>LG U+ 관점:</span>
            {overallImpactDist['위기'] > 0 && (
              <span className="rounded-full px-2 py-0.5 bg-negative-soft text-negative font-semibold">위기 {overallImpactDist['위기']}</span>
            )}
            {overallImpactDist['기회'] > 0 && (
              <span className="rounded-full px-2 py-0.5 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 font-semibold">기회 {overallImpactDist['기회']}</span>
            )}
            {overallImpactDist['관망'] > 0 && (
              <span className="rounded-full px-2 py-0.5 bg-muted text-muted-foreground font-semibold">관망 {overallImpactDist['관망']}</span>
            )}
          </div>
        )}
      </div>

      {competitorCount === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          경쟁사 키워드를 등록하면 동향을 모아 보여줍니다.
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          최근 14일 경쟁사 관련 기사가 없습니다.
        </div>
      ) : (
        <CompetitorNewsGroups groups={groups} articlesPerCard={8} />
      )}
    </PageContainer>
  )
}
