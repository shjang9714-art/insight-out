import type { Metadata } from 'next'
import TranslationStatusManager from '@/components/admin/TranslationStatusManager'

export const metadata: Metadata = {
  title: '번역 상태 | 어드민 | Insight Out',
  description: '번역 공급자 연결 상태와 월간 사용량을 관리합니다.',
}

export default function AdminTranslationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">번역 상태</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          영문 콘텐츠 번역 공급자의 연결 상태, 월간 사용량, 사용 여부를 관리합니다.
        </p>
      </div>
      <TranslationStatusManager />
    </div>
  )
}
