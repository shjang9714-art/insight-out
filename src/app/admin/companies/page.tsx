import type { Metadata } from 'next'
import CuratedAdminHub from '@/components/admin/CuratedAdminHub'

export const metadata: Metadata = {
  title: '주요기업 | 어드민 | Insight Out',
  description: '서비스 기업동향에 노출되는 주요기업과 그룹을 관리합니다.',
}

export default function AdminCompaniesPage() {
  return <CuratedAdminHub />
}
