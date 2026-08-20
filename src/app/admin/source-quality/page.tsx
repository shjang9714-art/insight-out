import { redirect } from 'next/navigation'

// 소스 관리의 "수집 품질" 탭으로 통합.
export default function SourceQualityPage() {
  redirect('/admin/sources?tab=source-quality')
}
