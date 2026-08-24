import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import BackLink from '@/components/BackLink'
import PageContainer from '@/components/PageContainer'
import DailyInsightDetail from '@/components/daily-insights/DailyInsightDetail'
import { createClient } from '@/lib/supabase/server'
import type { DailyInsightRow } from '@/lib/daily-insights/types'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data: rows } = await supabase.rpc('get_public_daily_insight', { p_id: id })
  const data = rows?.[0] ?? null

  return {
    title: data ? `${stripLlmArtifacts(data.headline)} | Insight Out` : '핵심 Insight | Insight Out',
    description: data?.summary_ko ? stripLlmArtifacts(data.summary_ko) : 'LG U+ B2B 시장 정보 핵심 Insight',
  }
}

export default async function DailyInsightDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: rows } = await supabase.rpc('get_public_daily_insight', { p_id: id })
  const data = rows?.[0] ?? null

  if (!data) notFound()

  const insight = data as DailyInsightRow

  // §2.5③ 관련 인사이트 — 같은 카테고리의 다른 주차 2~4건(published·자기 제외, week_of desc).
  let relatedInsights: DailyInsightRow[] = []
  if (insight.category) {
    const { data: related } = await supabase
      .from('daily_insights')
      .select('*')
      .eq('status', 'published')
      .eq('category', insight.category)
      .neq('id', insight.id)
      .order('week_of', { ascending: false })
      .limit(4)
    relatedInsights = (related ?? []) as DailyInsightRow[]
  }

  return (
    <PageContainer variant="reading" className="max-w-6xl">
      <div className="space-y-6">
        <BackLink
          fallbackHref="/dashboard/issues"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-brand-600"
        />
        <DailyInsightDetail insight={insight} relatedInsights={relatedInsights} />
      </div>
    </PageContainer>
  )
}
