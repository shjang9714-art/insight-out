import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PreparedNewsletterIssue } from '@/lib/newsletter/prepare-issue'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface TeamsNewsletterItem {
  group: string
  title: string
  summary: string
  insight: string
  source: string
  url: string | null
}

/** dispatch.ts 의 getTodayKST 와 동일 규칙(now + 9h). */
function getTodayKST(): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

function flattenPayload(payload: unknown): TeamsNewsletterItem[] {
  const p = payload as Partial<PreparedNewsletterIssue> | null | undefined
  if (!p || !Array.isArray(p.newsGroups)) return []
  const items: TeamsNewsletterItem[] = []
  for (const group of p.newsGroups) {
    if (!group || !Array.isArray(group.cards)) continue
    for (const card of group.cards) {
      items.push({
        group: group.label,
        title: card.title,
        summary: card.summaryKo ?? '',
        insight: card.insight ?? '',
        source: card.sourceName ?? '',
        url: card.originalUrl ?? card.detailUrl ?? null,
      })
    }
  }
  return items
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  }

  const requestedDate = request.nextUrl.searchParams.get('date')
  const date = requestedDate ?? getTodayKST()

  const admin = createAdminClient()
  const { data: issue } = await admin
    .from('newsletter_issues')
    .select('id, sent_on, subject, status, payload')
    .eq('sent_on', date)
    .eq('status', 'sent')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!issue) {
    return Response.json({ date, sent: false, items: [] })
  }

  const p = issue.payload as Partial<PreparedNewsletterIssue> | null
  return Response.json({
    date,
    sent: true,
    subject: issue.subject,
    teaser: p?.topTeaser?.headline ?? null,
    items: flattenPayload(issue.payload),
  })
}
