import { redirect } from 'next/navigation'

export default function AdminCrawlRulesPage() {
  redirect('/admin/sources?tab=crawl-settings')
}
