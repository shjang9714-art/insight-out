import type { Metadata } from 'next'
import KeywordManager from '@/components/admin/KeywordManager'

export const metadata: Metadata = {
  title: '카테고리 분류기준 | 어드민 | Insight Out',
  description: '콘텐츠를 서비스·카테고리로 자동 분류·태깅하는 키워드를 관리합니다.',
}

export default function AdminKeywordsPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">카테고리 분류기준</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          콘텐츠를 서비스·카테고리로 자동 분류·태깅하는 키워드를 관리합니다.
        </p>
      </div>
      <KeywordManager />
    </>
  )
}
