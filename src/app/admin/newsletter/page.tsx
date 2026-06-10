import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import NewsletterManager from '@/components/admin/NewsletterManager'

export const metadata: Metadata = {
  title: '뉴스레터 관리 | Insight Out 어드민',
}

export const dynamic = 'force-dynamic'

export default async function AdminNewsletterPage() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [{ data: settings }, { data: issues }] = await Promise.all([
    db.from('newsletter_settings').select('*').eq('id', 1).single(),
    db
      .from('newsletter_issues')
      .select('id, sent_on, subject, recipient_cnt, status, triggered_by, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const defaultSettings = {
    is_enabled: false,
    send_hour_kst: 8,
    send_days: [1],
    card_count: 5,
    subject_tpl: 'Insight Out 뉴스레터 · {date}',
    last_sent_on: null,
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">뉴스레터 관리</h1>
        <p className="mt-1 text-sm text-muted-foreground">발송 설정, 미리보기, 수동 발송, 발송 이력을 관리합니다.</p>
      </div>

      <NewsletterManager
        initialSettings={settings ?? defaultSettings}
        initialIssues={issues ?? []}
      />
    </div>
  )
}
