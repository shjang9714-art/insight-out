import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import BackLink from '@/components/BackLink'
import PageContainer from '@/components/PageContainer'
import DailyInsightDetail from '@/components/daily-insights/DailyInsightDetail'
import { createClient } from '@/lib/supabase/server'
import type { DailyInsightRow } from '@/lib/daily-insights/types'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('daily_insights').select('headline, summary_ko').eq('id', id).single()

  return {
    title: data ? `${data.headline} | Insight Out` : '핵심 Insight | Insight Out',
    description: data?.summary_ko ?? 'LG U+ B2B 시장 정보 핵심 Insight',
  }
}

export default async function DailyInsightDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data } = await supabase.from('daily_insights').select('*').eq('id', id).eq('status', 'published').single()

  if (!data) notFound()

  return (
    <PageContainer variant="reading">
      <div className="space-y-6">
        <BackLink
          fallbackHref="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-brand-600"
        />
        <DailyInsightDetail insight={data as DailyInsightRow} />
      </div>
    </PageContainer>
  )
}
