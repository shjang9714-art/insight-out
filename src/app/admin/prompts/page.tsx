import type { Metadata } from 'next'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import PromptConsole from '@/components/admin/PromptConsole'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '프롬프트 콘솔 | Insight Out 어드민',
  description: 'AI 생성기 프롬프트를 한 곳에서 편집·저장합니다.',
}

export default function PromptsAdminPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader />
      <p className="text-sm text-muted-foreground">
        프롬프트를 저장하면 <strong>다음 생성부터 즉시 적용</strong>됩니다. 결과 품질은 생성 후 상세·미리보기로 검수하세요.
        저장 전 값은 코드 기본값(폴백)이 쓰입니다.
      </p>
      <PromptConsole />
    </div>
  )
}
