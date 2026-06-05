import type { Metadata } from 'next'
import SourceManager from '@/components/admin/SourceManager'

export const metadata: Metadata = {
  title: '소스 관리 | 어드민 | Insight Out',
  description: '크롤링 소스(뉴스 피드, 리포트 발행처 등) 추가·수정·삭제·활성 관리',
}

export default function AdminSourcesPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">크롤링 소스 관리</h1>
        <p className="mt-1 text-sm text-gray-500">
          RSS 뉴스 피드·리포트 발행처 등 수집 소스를 관리합니다.
          비활성화하면 다음 수집 사이클부터 제외됩니다.
        </p>
      </div>
      <SourceManager />
    </>
  )
}
