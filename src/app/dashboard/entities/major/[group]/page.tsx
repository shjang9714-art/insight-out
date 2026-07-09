import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import BackLink from '@/components/BackLink'
import PageContainer from '@/components/PageContainer'
import MajorCompanyGroups from '@/components/entities/MajorCompanyGroups'
import { getMajorCompaniesData } from '@/lib/entities/major-companies'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ group: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { group } = await params
  return {
    title: `주요 기업 전체보기 | Insight Out`,
    description: `${group} 그룹의 전체 주요 기업 동향을 확인합니다.`,
  }
}

export default async function MajorCompanyGroupPage({ params }: PageProps) {
  const { group: groupKey } = await params

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
  const { groups } = await getMajorCompaniesData(supabase, { userId: user?.id })
  const group = groups.find(g => g.key === groupKey)
  if (!group) notFound()

  return (
    <PageContainer>
      <div className="mb-4">
        <BackLink
          fallbackHref="/dashboard/entities?view=watchlist"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-brand-600"
        />
      </div>

      <div className="mb-4">
        <h1 className="text-xl font-bold text-foreground">{group.label}</h1>
        <p className="mt-1 text-xs text-muted-foreground">{group.companies.length}개사 · 전체 보기</p>
      </div>

      <MajorCompanyGroups groups={[group]} />
    </PageContainer>
  )
}
