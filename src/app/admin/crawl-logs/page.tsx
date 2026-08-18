import { redirect } from 'next/navigation'

// 524 — 실행 이력(/admin/job-runs)의 "로그 분석" 탭으로 통합.
export default function CrawlLogsPage() {
  redirect('/admin/job-runs?tab=crawl-logs')
}
