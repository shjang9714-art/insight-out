import type { Metadata } from 'next'
import { Suspense } from 'react'
import BriefingHub from '@/components/admin/BriefingHub'

export const metadata: Metadata = {
  title: '모닝브리핑 | 어드민 | Insight Out',
  description: '모닝브리핑 목록, 스크립트 확인, 오디오 생성, 승인을 관리합니다.',
}

export default function AdminBriefingsPage() {
  return (
    <Suspense fallback={null}>
      <BriefingHub />
    </Suspense>
  )
}
