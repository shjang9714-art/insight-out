import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { ENTITY_TYPE_LABEL, type EntityType } from '@/lib/types'
import type { EntitySummary } from '@/components/entities/KnowledgeGraph'
import EntitiesPageClient from '@/components/entities/EntitiesPageClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '지식그래프 | Insight Out',
  description: '엔티티 관계 탐색 — 기업·기술·이슈의 연결망을 시각적으로 확인합니다.',
}

export default async function EntitiesPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) {
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  // 검색·선택용 전체 엔티티 목록 (상위 500)
  const { data: entityRows } = await supabase
    .from('entities')
    .select('id, canonical_name, entity_type, is_competitor, mention_count')
    .order('mention_count', { ascending: false })
    .limit(500)

  const entities = (entityRows ?? []) as EntitySummary[]

  // 초기 중심 = mention 최상위 1개
  const initialCenter = entities.length > 0 ? entities[0] : null

  // 목록 뷰용 상세 데이터 (description 포함)
  const { data: allEntityRows } = await supabase
    .from('entities')
    .select('id, canonical_name, entity_type, is_competitor, mention_count, description')
    .order('mention_count', { ascending: false })
    .limit(500)

  const allEntities = (allEntityRows ?? []) as {
    id: string
    canonical_name: string
    entity_type: EntityType
    is_competitor: boolean
    mention_count: number
    description: string | null
  }[]

  const totalByType: Record<string, number> = { 전체: allEntities.length }
  for (const type of Object.keys(ENTITY_TYPE_LABEL) as EntityType[]) {
    totalByType[type] = allEntities.filter((e) => e.entity_type === type).length
  }

  return (
    <EntitiesPageClient
      initialCenter={initialCenter}
      entities={entities}
      allEntities={allEntities}
      totalByType={totalByType}
    />
  )
}
