import { redirect } from 'next/navigation'

// 524 — 실행 이력(/admin/job-runs)의 "감사 로그" 탭으로 통합.
export default function AuditLogPage() {
  redirect('/admin/job-runs?tab=audit')
}
