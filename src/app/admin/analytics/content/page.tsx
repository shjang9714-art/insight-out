import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { gatherContentAnalytics } from '@/lib/admin/analytics'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import ContentAnalyticsView from '@/components/admin/ContentAnalyticsView'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '콘텐츠 분석 | 어드민 | Insight Out',
  description: '콘텐츠 수집 추이·카테고리·상태·소스·북마크 성과를 확인합니다.',
}

const VALID_DAYS = [7, 30, 90] as const

function parseDays(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value)
  return (VALID_DAYS as readonly number[]).includes(n) ? n : 30
}

export default async function ContentAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const windowDays = parseDays(params.days)
  const admin = createAdminClient()
  const data = await gatherContentAnalytics(admin, windowDays)

  return (
    <>
      <AdminPageHeader />
      <ContentAnalyticsView data={data} />
    </>
  )
}
