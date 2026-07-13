import { redirect } from 'next/navigation'

// 279/330 — 화면 분할(데이터 보강→/admin/enrich, purge→/admin/maintenance)로 이 라우트는 폐지.
// 북마크 호환을 위해 리다이렉트만 유지 (/admin/raw 패턴과 동일).
export default function AdminContentDataPage() {
  redirect('/admin/enrich')
}
