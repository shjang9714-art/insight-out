import { redirect } from 'next/navigation'

// 524 — 통계분석(/admin/analytics/content)의 "발행 분석" 탭으로 통합.
export default function PublishAnalyticsPage() {
  redirect('/admin/analytics/content?tab=publish')
}
