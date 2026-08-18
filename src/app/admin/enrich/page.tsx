import { redirect } from 'next/navigation'

// 524 — 수집 규칙(/admin/crawl-settings)의 "데이터 보강 재처리" 탭으로 통합.
export default function EnrichPage() {
  redirect('/admin/crawl-settings?tab=enrich')
}
