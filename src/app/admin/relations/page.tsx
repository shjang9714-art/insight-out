import type { Metadata } from 'next'
import type { EntityType } from '@/lib/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { listEntities, getEntityRelations, getRelationEvidence } from '@/lib/admin/relations'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import RelationsExplorer from '@/components/admin/RelationsExplorer'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '관계지도 | 어드민 | Insight Out',
  description: '엔티티 동시출현 관계·근거 콘텐츠를 탐색합니다.',
}

const ENTITY_TYPES: EntityType[] = ['company', 'tech', 'product', 'person', 'policy', 'industry']

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function RelationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const q = one(params.q)
  const typeParam = one(params.type)
  const type = typeParam && (ENTITY_TYPES as string[]).includes(typeParam) ? (typeParam as EntityType) : null
  const competitorOnly = one(params.competitor) === '1'
  const entityId = one(params.entity)
  const withId = one(params.with)

  const admin = createAdminClient()

  const [entities, relations, evidence] = await Promise.all([
    listEntities(admin, { q, type, competitorOnly }),
    entityId ? getEntityRelations(admin, entityId) : Promise.resolve(null),
    entityId && withId ? getRelationEvidence(admin, entityId, withId) : Promise.resolve([]),
  ])

  return (
    <>
      <AdminPageHeader />
      <RelationsExplorer
        entities={entities}
        query={q ?? ''}
        type={type}
        competitorOnly={competitorOnly}
        selectedEntityId={entityId ?? null}
        relations={relations}
        withId={withId ?? null}
        evidence={evidence}
      />
    </>
  )
}
