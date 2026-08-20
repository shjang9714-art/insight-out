import { redirect } from 'next/navigation'

// 시스템 설정의 "홈 화면 구성" 탭으로 통합. 딥링크 호환을 위해 경로는 유지한다.
export default function AdminHomepageSectionsPage() {
  redirect('/admin/settings?tab=homepage')
}
