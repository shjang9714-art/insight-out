'use server'

import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { runNewsletterDispatch } from '@/lib/newsletter/dispatch'
import { buildNewsletterHtml } from '@/lib/email/newsletter-template'
import { prepareNewsletterIssue } from '@/lib/newsletter/prepare-issue'
import { toTemplateTopTeaser } from '@/lib/newsletter/top-teaser'

async function requireAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? user : null
}

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface NewsletterSettingsInput {
  is_enabled: boolean
  send_hour_kst: number
  send_days: number[]
  card_count: number
  subject_tpl: string
}

export async function updateNewsletterSettings(input: NewsletterSettingsInput) {
  const user = await requireAdmin()
  if (!user) return { error: '관리자 권한이 필요합니다.' }

  if (input.send_hour_kst < 0 || input.send_hour_kst > 23) {
    return { error: '발송 시각은 0~23 사이여야 합니다.' }
  }
  if (!input.send_days.length || input.send_days.some((d) => d < 1 || d > 7)) {
    return { error: '발송 요일을 하나 이상 선택해주세요.' }
  }
  if (input.card_count < 1 || input.card_count > 10) {
    return { error: '카드 수는 1~10 사이여야 합니다.' }
  }
  if (!input.subject_tpl.trim()) {
    return { error: '제목 템플릿을 입력해주세요.' }
  }

  const { error } = await serviceClient()
    .from('newsletter_settings')
    .update({
      is_enabled: input.is_enabled,
      send_hour_kst: input.send_hour_kst,
      send_days: input.send_days,
      card_count: input.card_count,
      subject_tpl: input.subject_tpl,
    })
    .eq('id', 1)

  if (error) return { error: `저장 실패: ${error.message}` }
  return { ok: true }
}

export async function sendNewsletterNow() {
  const user = await requireAdmin()
  if (!user) return { error: '관리자 권한이 필요합니다.' }

  try {
    const result = await runNewsletterDispatch({ triggeredBy: 'manual' })
    return result
  } catch (err) {
    return { error: err instanceof Error ? err.message : '발송 중 오류가 발생했습니다.' }
  }
}

export async function getPreviewHtml() {
  const user = await requireAdmin()
  if (!user) return { error: '관리자 권한이 필요합니다.' }

  const db = serviceClient()

  const { data: settings } = await db
    .from('newsletter_settings')
    .select('card_count, subject_tpl')
    .eq('id', 1)
    .single()

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://insight-out-app.vercel.app'

  // 관리자 미리보기 — 주식 필터·티저는 실제 발송과 동일 로직 재사용, 카드 인사이트는
  // 반복 클릭 시 매번 LLM을 호출하지 않도록 생략(무거운 재생성 반복 금지).
  const prepared = await prepareNewsletterIssue(db, {
    cardCount: settings?.card_count ?? 5,
    baseUrl,
    generateInsights: false,
  })

  const { count: sentIssueCount } = await db
    .from('newsletter_issues')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'sent')

  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const html = buildNewsletterHtml({
    dateLabel: today,
    issueNo: (sentIssueCount ?? 0) + 1,
    greetingName: null,
    newsGroups: prepared.newsGroups.map((g) => ({
      key: g.key,
      label: g.label,
      cards: g.cards.map((c) => ({
        title: c.title,
        category: c.category,
        sourceName: c.sourceName,
        summaryKo: c.summaryKo,
        detailUrl: c.detailUrl,
        originalUrl: c.originalUrl,
        insight: c.insight,
      })),
    })),
    topTeaser: toTemplateTopTeaser(prepared.topTeaser),
    knowledgeReports: prepared.knowledgeReports,
    companyTrends: prepared.companyTrends,
    unsubscribeUrl: `${baseUrl}/api/newsletter/unsubscribe?token=PREVIEW`,
  })

  return { html }
}
