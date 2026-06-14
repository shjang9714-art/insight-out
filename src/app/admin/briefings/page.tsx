import type { Metadata } from 'next'
import BriefingManager from '@/components/admin/BriefingManager'

export const metadata: Metadata = {
  title: '모닝브리핑 | 어드민 | Insight Out',
  description: '모닝브리핑 목록, 스크립트 확인, 오디오 생성, 승인을 관리합니다.',
}

export default function AdminBriefingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">모닝브리핑 관리</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          브리핑 목록을 확인하고 오디오를 생성·승인하면 사용자 플레이어에 공개됩니다.
        </p>
      </div>
      <BriefingManager />
    </div>
  )
}
