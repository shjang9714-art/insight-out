import { redirect } from 'next/navigation'

// 279 — 화면 분할(백필→/admin/ai-jobs, purge→/admin/maintenance)로 이 라우트는 폐지.
// 북마크 호환을 위해 리다이렉트만 유지 (/admin/raw 패턴과 동일).
export default function AdminContentDataPage() {
  redirect('/admin/ai-jobs')
}
