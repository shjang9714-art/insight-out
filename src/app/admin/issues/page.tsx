import type { Metadata } from 'next'
import IssueManager from '@/components/admin/IssueManager'

export const metadata: Metadata = {
  title: '이슈 관리 | 어드민 | Insight Out',
  description: '이슈 생성·발행·match_keywords·콘텐츠 배정 관리',
}

export default function AdminIssuesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">이슈 관리</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          이슈를 생성하고 발행 상태를 관리합니다.
          match_keywords 로 콘텐츠를 자동 배정하거나, 수동으로 콘텐츠를 추가·해제할 수 있습니다.
        </p>
      </div>
      <IssueManager />
    </div>
  )
}
