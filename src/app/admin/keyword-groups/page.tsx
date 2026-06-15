import type { Metadata } from 'next'
import KeywordGroupManager from '@/components/admin/KeywordGroupManager'

export const metadata: Metadata = {
  title: '토픽 규칙 | 어드민 | Insight Out',
  description: '관련도 게이트·해시태그·검색어(search_seeds)·시그널을 정의합니다.',
}

export default function KeywordGroupsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">토픽 규칙</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          관련도 게이트·해시태그·검색어(search_seeds)·시그널을 정의합니다.
          include = 관련도↑/태그, exclude = 하드 제외, search_seeds = 뉴스·유튜브 검색어, weight = 가중치, signal_hint = 시그널 매핑.
          변경은 다음 수집부터 즉시 반영됩니다.
        </p>
      </div>
      <KeywordGroupManager />
    </div>
  )
}
