import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import NewsletterManager from '@/components/admin/NewsletterManager'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'

export const metadata: Metadata = {
  title: '뉴스레터 | Insight Out 어드민',
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
      <AdminPageHeader />

      <NewsletterManager
        initialSettings={settings ?? defaultSettings}
        initialIssues={issues ?? []}
      />
    </div>
  )
}
