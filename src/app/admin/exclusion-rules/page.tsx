import { redirect } from 'next/navigation'

// 524 — 수집 규칙(/admin/crawl-settings)의 "제외 규칙" 탭으로 통합.
export default function ExclusionRulesPage() {
  redirect('/admin/crawl-settings?tab=exclusion-rules')
}
