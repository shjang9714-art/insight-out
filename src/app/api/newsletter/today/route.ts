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
  // 577 — 읽기 전용 피드는 크론용 인증키를 쓰지 않는다. 그 키는 크롤·요약·뉴스레터 발송 등
  // 22곳의 쓰기 트리거를 함께 여는 열쇠라, 외부 통합(Power Automate)에 넘기면 읽기 전용
  // 통합이 쓰기 권한 전체를 들게 된다. 미설정이면 항상 401(fail-closed)이 정상이다.
  const feedSecret = process.env.NEWSLETTER_FEED_SECRET

  if (!feedSecret || authHeader !== `Bearer ${feedSecret}`) {
    return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  }

  const requestedDate = request.nextUrl.searchParams.get('date')
  // 577 — 검증 없이 .eq('sent_on', …) 에 넘기면 잘못된 값이 Postgres 에서 거부되고,
  // 아래에서 error 를 안 보므로 "미발송"으로 조용히 둔갑한다.
  if (requestedDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    return Response.json(
      { ok: false, error: 'date 는 YYYY-MM-DD 형식이어야 합니다.' },
      { status: 400 },
    )
  }
  const date = requestedDate ?? getTodayKST()

  const admin = createAdminClient()
  const { data: issue, error } = await admin
    .from('newsletter_issues')
    .select('id, sent_on, subject, status, payload')
    .eq('sent_on', date)
    .eq('status', 'sent')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // 577 — 조회 실패를 "미발송"으로 보고하면 팀즈에 조용히 빈 카드가 올라간다.
  if (error) {
    console.error('[newsletter/today] 조회 실패:', error.message)
    return Response.json({ ok: false, error: '뉴스레터 조회에 실패했습니다.' }, { status: 500 })
  }

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
