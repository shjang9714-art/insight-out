import { createClient } from '@/lib/supabase/server'
import { HOME_SECTION_REGISTRY } from '@/lib/home/sections'

export interface HomeSectionLayoutItem {
  key: string
  enabled: boolean
}

function defaultLayout(): HomeSectionLayoutItem[] {
  return HOME_SECTION_REGISTRY.map((s) => ({ key: s.key, enabled: true }))
}

/**
 * 공개 홈 섹션 순서·노출 조회. homepage_sections 테이블이 없거나(42P01) 비어 있으면
 * 레지스트리 기본 순서(전부 노출)로 graceful fallback — SQL 미적용 상태에서도 회귀 없음.
 */
export async function getHomeSectionLayout(): Promise<HomeSectionLayoutItem[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('homepage_sections')
      .select('section_key, enabled, sort_order')
      .order('sort_order')

    if (error || !data || data.length === 0) {
      return defaultLayout()
    }

    const registryKeys = new Set(HOME_SECTION_REGISTRY.map((s) => s.key))
    const known = data.filter((row) => registryKeys.has(row.section_key))
    const knownKeys = new Set(known.map((row) => row.section_key))
    const missing = HOME_SECTION_REGISTRY.filter((s) => !knownKeys.has(s.key))

    return [
      ...known.map((row) => ({ key: row.section_key as string, enabled: row.enabled as boolean })),
      ...missing.map((s) => ({ key: s.key, enabled: true })),
    ]
  } catch {
    return defaultLayout()
  }
}
