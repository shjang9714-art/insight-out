import type { Metadata } from 'next'
import EntityManager from '@/components/admin/EntityManager'

export const metadata: Metadata = {
  title: '엔티티 사전 | 어드민 | Insight Out',
  description: '기업·기술·인물 등 엔티티 정규화·동의어 관리·중복 병합',
}

export default function EntitiesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">엔티티 사전</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          기업·기술·인물·정책·산업 엔티티를 정규화합니다.
          동의어를 묶어 중복을 제거하고, 같은 대상을 가리키는 여러 표기를 병합할 수 있습니다.
        </p>
      </div>
      <EntityManager />
    </div>
  )
}
