import type { Metadata } from 'next'
import KeywordManager from '@/components/admin/KeywordManager'

export const metadata: Metadata = {
  title: '서비스 키워드 | 어드민 | Insight Out',
  description: '콘텐츠를 LG U+ 서비스에 자동 태깅하는 키워드를 관리합니다.',
}

export default function AdminKeywordsPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">서비스 키워드</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          콘텐츠를 LG U+ 서비스에 자동 태깅하는 키워드를 관리합니다.
        </p>
      </div>
      <KeywordManager />
    </>
  )
}
