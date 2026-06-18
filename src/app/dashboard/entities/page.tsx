import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { Network } from 'lucide-react'
import { ENTITY_TYPE_LABEL, type EntityType } from '@/lib/types'
import EntityBrowse from '@/components/entities/EntityBrowse'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '지식그래프 | Insight Out',
  description: '기업·기술·인물 등 엔티티와 관계를 탐색하는 지식그래프',
}

interface EntityItem {
  id: string
  canonical_name: string
  entity_type: EntityType
  is_competitor: boolean
  mention_count: number
  description: string | null
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
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">

      {/* 헤더 */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Network className="h-6 w-6 text-brand-600" />
          <h1 className="text-2xl font-bold text-foreground">지식그래프</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          기업·기술·인물·정책 등 엔티티를 탐색하고 관계를 확인합니다.
        </p>
      </div>

      <EntityBrowse entities={entities} totalByType={totalByType} />
    </div>
  )
}
