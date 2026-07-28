import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import BackLink from '@/components/BackLink'
import PageContainer from '@/components/PageContainer'
import MajorCompanyGroups from '@/components/entities/MajorCompanyGroups'
import MajorCompanyWeeklyTimeline from '@/components/entities/MajorCompanyWeeklyTimeline'
import { getMajorCompaniesData } from '@/lib/entities/major-companies'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ group: string }>
  searchParams: Promise<{ week?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { group } = await params
  return {
    title: `주요 기업 전체보기 | Insight Out`,
    description: `${group} 그룹의 전체 주요 기업 동향을 확인합니다.`,
  }
}

export default async function MajorCompanyGroupPage({ params, searchParams }: PageProps) {
  const { group: groupKey } = await params
  const query = await searchParams
  const requestedWeek = typeof query.week === 'string' && query.week ? query.week : undefined

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

  const { data: { user } } = await supabase.auth.getUser()
  const { groups, availableWeeks, selectedWeek } = await getMajorCompaniesData(supabase, {
    userId: user?.id,
    weekStart: requestedWeek,
    includeEmptyGroups: true,
  })
  const group = groups.find(g => g.key === groupKey)
  if (!group) notFound()

  return (
    <PageContainer>
      <div className="mb-4">
        <BackLink
          fallbackHref={`/dashboard/entities?view=watchlist${selectedWeek ? `&week=${selectedWeek}` : ''}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-brand-600"
        />
      </div>

      <div className="space-y-8">
        <MajorCompanyWeeklyTimeline
          weeks={availableWeeks}
          activeWeekStart={selectedWeek}
          hrefBase={`/dashboard/entities/major/${groupKey}`}
        />

        {/* 섹션 헤더(그룹명·기업 수)는 MajorCompanyGroups가 렌더 — 중복 제목 금지 */}
        <MajorCompanyGroups groups={[group]} weekStart={selectedWeek ?? undefined} />

        {group.companies.length === 0 && (
          <div className="rounded-xl border border-dashed p-8 text-center space-y-2">
            <p className="text-sm font-medium text-foreground">선택한 주의 주요 기업 동향이 없습니다</p>
            <p className="text-xs text-muted-foreground">다른 주를 선택하거나 해당 주 카드를 재생성해 주세요.</p>
          </div>
        )}
      </div>
    </PageContainer>
  )
}
