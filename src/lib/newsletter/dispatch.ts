import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { buildNewsletterHtml } from '@/lib/email/newsletter-template'

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
    .select('user_id, newsletter_email, unsubscribe_token')
    .eq('is_active', true)
    .not('newsletter_email', 'is', null)

  if (!subscribers || subscribers.length === 0) {
    return { ok: true, skipped: 'no_recipients' }
  }

  // 3. 콘텐츠 선정
  const { data: contents } = await supabase
    .from('contents')
    .select('id, title, category, summary_ko, original_url, sources(name)')
    .eq('status', 'published')
    .order('is_editor_pick', { ascending: false })
    .order('view_count', { ascending: false })
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(settings.card_count ?? 5)

  if (!contents || contents.length === 0) {
    return { ok: true, skipped: 'no_contents' }
  }

  // 4. issue 생성
  const subject = (settings.subject_tpl ?? 'Insight Out 뉴스레터 · {date}').replace('{date}', todayKST)
  const contentIds = contents.map((c) => c.id)

  const { data: issue, error: issueErr } = await supabase
    .from('newsletter_issues')
    .insert({
      sent_on: todayKST,
      subject,
      content_ids: contentIds,
      recipient_cnt: subscribers.length,
      status: 'pending',
      triggered_by: triggeredBy,
    })
    .select('id')
    .single()

  if (issueErr || !issue) {
    return { ok: false, skipped: 'issue_insert_failed' }
  }

  // 5. 이메일 발송
  const resend = new Resend(process.env.RESEND_API_KEY)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://insight-out-app.vercel.app'

  const cards = contents.map((c) => {
    const src = c.sources as unknown
    const sourceName =
      Array.isArray(src) && src.length > 0
        ? (src[0] as { name: string }).name
        : src && typeof (src as { name?: unknown }).name === 'string'
          ? (src as { name: string }).name
          : null
    return {
      title: c.title,
      category: c.category,
      sourceName,
      summaryKo: c.summary_ko,
      url: c.original_url ? c.original_url : `${baseUrl}/dashboard/contents/${c.id}`,
    }
  })

  let sent = 0
  let failed = 0

  for (const sub of subscribers) {
    const unsubscribeUrl = `${baseUrl}/api/newsletter/unsubscribe?token=${sub.unsubscribe_token}`
    const html = buildNewsletterHtml({ dateLabel: todayKST, cards, unsubscribeUrl })

    try {
      const { data: sendData, error: sendErr } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev',
        to: sub.newsletter_email!,
        subject,
        html,
      })

      if (sendErr || !sendData?.id) {
        await supabase.from('newsletter_recipients').insert({
          issue_id: issue.id,
          user_id: sub.user_id,
          email: sub.newsletter_email!,
          status: 'failed',
          error: sendErr?.message ?? '발송 실패',
        })
        failed++
      } else {
        await supabase.from('newsletter_recipients').insert({
          issue_id: issue.id,
          user_id: sub.user_id,
          email: sub.newsletter_email!,
          resend_message_id: sendData.id,
          status: 'sent',
        })
        sent++
      }
    } catch (err) {
      await supabase.from('newsletter_recipients').insert({
        issue_id: issue.id,
        user_id: sub.user_id,
        email: sub.newsletter_email!,
        status: 'failed',
        error: err instanceof Error ? err.message : '알 수 없는 오류',
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
