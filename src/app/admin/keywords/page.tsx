import type { Metadata } from 'next'
import KeywordManager from '@/components/admin/KeywordManager'

export const metadata: Metadata = {
  title: '키워드 관리 | 어드민 | Insight Out',
  description: '서비스별 태깅 키워드를 추가·수정·삭제합니다.',
}

export default function AdminKeywordsPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">키워드 관리</h1>
        <p className="mt-1 text-sm text-gray-500">
          크롤러가 이 키워드로 콘텐츠를 서비스에 자동 태깅합니다.
        </p>
      </div>
      <KeywordManager />
    </>
  )
}
