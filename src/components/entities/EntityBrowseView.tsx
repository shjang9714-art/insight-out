import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { ENTITY_TYPE_LABEL, type EntityType } from '@/lib/types'
import EntityBrowse from '@/components/entities/EntityBrowse'

interface EntityItem {
  id: string
  canonical_name: string
  entity_type: EntityType
  is_competitor: boolean
  mention_count: number
  description: string | null
}

export default async function EntityBrowseView() {
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

  const { data } = await supabase
    .from('entities')
    .select('id, canonical_name, entity_type, is_competitor, mention_count, description')
    .order('mention_count', { ascending: false })
    .limit(500)

  const entities: EntityItem[] = (data ?? []) as EntityItem[]

  const totalByType: Record<string, number> = { 전체: entities.length }
  for (const type of Object.keys(ENTITY_TYPE_LABEL) as EntityType[]) {
    totalByType[type] = entities.filter((e) => e.entity_type === type).length
  }

  return (
    <div>
      <p className="mb-6 text-sm text-muted-foreground">
        기업·기술·인물·정책 등 엔티티를 탐색하고 관계를 확인합니다.
      </p>
      <EntityBrowse entities={entities} totalByType={totalByType} />
    </div>
  )
}
