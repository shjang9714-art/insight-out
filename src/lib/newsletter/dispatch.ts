import { createClient } from '@supabase/supabase-js'
import { sendBrevoEmail } from '@/lib/email/brevo'
import { buildNewsletterHtml } from '@/lib/email/newsletter-template'
import { prepareNewsletterIssue } from '@/lib/newsletter/prepare-issue'

export interface DispatchResult {
  ok: boolean
  issueId?: string
  sent?: number
  failed?: number
  skipped?: string
}

function getTodayKST(): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

function getDayOfWeekKST(): number {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const day = kst.getUTCDay()
  // Convert: 0=Sun → 7, 1=Mon → 1, ..., 6=Sat → 6
  return day === 0 ? 7 : day
}

export async function runNewsletterDispatch({
  triggeredBy,
}: {
  triggeredBy: 'cron' | 'manual'
}): Promise<DispatchResult> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. 전역 설정 로드
  const { data: settings, error: settingsErr } = await supabase
    .from('newsletter_settings')
    .select('*')
    .eq('id', 1)
    .single()

  if (settingsErr || !settings) {
    return { ok: false, skipped: 'settings_not_found' }
  }

  if (!settings.is_enabled) {
    return { ok: true, skipped: 'disabled' }
  }

  const todayKST = getTodayKST()

  // cron 전용 체크: 요일 + 중복 방지
  if (triggeredBy === 'cron') {
    const dayOfWeek = getDayOfWeekKST()
    const sendDays: number[] = settings.send_days ?? [1]
    if (!sendDays.includes(dayOfWeek)) {
      return { ok: true, skipped: 'not_a_send_day' }
    }

    if (settings.last_sent_on === todayKST) {
      return { ok: true, skipped: 'already_sent' }
    }
  }

  // 2. 수신자 조회
  const { data: subscribers } = await supabase
    .from('newsletter_subscriptions')
    .select('user_id, newsletter_email, unsubscribe_token, users(name)')
    .eq('is_active', true)
    .not('newsletter_email', 'is', null)

  if (!subscribers || subscribers.length === 0) {
    return { ok: true, skipped: 'no_recipients' }
  }

  // 3. 카드 선정(주식·증권 필터 적용) + 카드별 인사이트 배치 생성(1콜) + 티저 3종 조회.
  // 발송 시점(수신자별 반복 루프) 안에서는 LLM을 절대 호출하지 않는다 — 여기서 한 번만 생성해
  // issue.payload 에 저장하고, 아래 발송 루프는 저장된 값만 읽는다.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://insight-out-app.vercel.app'
  const prepared = await prepareNewsletterIssue(supabase, {
    cardCount: settings.card_count ?? 5,
    baseUrl,
  })

  if (prepared.newsGroups.every((g) => g.cards.length === 0)) {
    return { ok: true, skipped: 'no_contents' }
  }

  // 4. issue 생성 — 카드 인사이트·티저·5분류 그룹 데이터는 payload 에 그대로 저장(감사 추적 + 재사용 가능).
  const subject = (settings.subject_tpl ?? 'Insight Out 뉴스레터 · {date}').replace('{date}', todayKST)
  const contentIds = prepared.newsGroups.flatMap((g) => g.cards.map((c) => c.id))

  const { count: sentIssueCount } = await supabase
    .from('newsletter_issues')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'sent')
  const issueNo = (sentIssueCount ?? 0) + 1

  const { data: issue, error: issueErr } = await supabase
    .from('newsletter_issues')
    .insert({
      sent_on: todayKST,
      subject,
      content_ids: contentIds,
      recipient_cnt: subscribers.length,
      status: 'pending',
      triggered_by: triggeredBy,
      payload: prepared,
    })
    .select('id')
    .single()

  if (issueErr || !issue) {
    return { ok: false, skipped: 'issue_insert_failed' }
  }

  // 5. 이메일 발송 — 아래 루프는 위에서 준비된 prepared 값만 읽는다(추가 조회·LLM 호출 없음).
  let sent = 0
  let failed = 0

  for (const sub of subscribers) {
    const unsubscribeUrl = `${baseUrl}/api/newsletter/unsubscribe?token=${sub.unsubscribe_token}`
    const subUser = Array.isArray(sub.users) ? sub.users[0] : sub.users
    const html = buildNewsletterHtml({
      dateLabel: todayKST,
      issueNo,
      greetingName: subUser?.name || null,
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
      dailyInsight: prepared.dailyInsight
        ? { headline: prepared.dailyInsight.headline, summaryKo: prepared.dailyInsight.summaryKo, detailUrl: prepared.dailyInsight.detailUrl }
        : null,
      knowledgeReports: prepared.knowledgeReports,
      companyTrends: prepared.companyTrends,
      unsubscribeUrl,
    })

    try {
      const messageId = await sendBrevoEmail({ to: sub.newsletter_email!, subject, html })
      if (!messageId) throw new Error('messageId 없음')
      await supabase.from('newsletter_recipients').insert({
        issue_id: issue.id,
        user_id: sub.user_id,
        email: sub.newsletter_email!,
        message_id: messageId,
        status: 'sent',
      })
      sent++
    } catch (err) {
      await supabase.from('newsletter_recipients').insert({
        issue_id: issue.id,
        user_id: sub.user_id,
        email: sub.newsletter_email!,
        status: 'failed',
        error: err instanceof Error ? err.message : '발송 실패',
      })
      failed++
    }
  }

  // 6. issue 상태 업데이트
  const issueStatus = failed === 0 ? 'sent' : sent === 0 ? 'failed' : 'partial'
  await supabase
    .from('newsletter_issues')
    .update({ status: issueStatus, recipient_cnt: sent + failed })
    .eq('id', issue.id)

  // cron 성공 시 last_sent_on 갱신
  if (triggeredBy === 'cron' && sent > 0) {
    await supabase
      .from('newsletter_settings')
      .update({ last_sent_on: todayKST })
      .eq('id', 1)
  }

  return { ok: true, issueId: issue.id, sent, failed }
}
