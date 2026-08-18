import { redirect } from 'next/navigation'

// 524 — 통계분석(/admin/analytics/content)의 "AI 사용량·비용" 탭으로 통합.
export default function AiCostAnalyticsPage() {
  redirect('/admin/analytics/content?tab=ai-cost')
}
