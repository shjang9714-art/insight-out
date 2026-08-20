import type { Metadata } from 'next'
import { Suspense } from 'react'
import KeywordsHub from '@/components/admin/KeywordsHub'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '키워드 | 어드민 | Insight Out',
  description: '분류 키워드, 수집 키워드그룹·시그널 기준, 관계지도 사전을 통합 관리합니다.',
}

export default function AdminKeywordsPage() {
  return (
    <Suspense fallback={null}>
      <KeywordsHub />
    </Suspense>
  )
}
