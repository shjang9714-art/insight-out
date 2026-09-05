import type { SupabaseClient } from '@supabase/supabase-js'

export interface SelectableEntity {
  id: string
  canonical_name: string
}

export async function fetchSelectableCompetitors(
  supabase: SupabaseClient,
): Promise<SelectableEntity[]> {
  const { data, error } = await supabase
    .from('entities')
    .select('id, canonical_name')
    .eq('is_competitor', true)
    .in('entity_type', ['company', 'org'])
    .order('canonical_name')

  if (error) throw error
  return (data ?? []) as SelectableEntity[]
}
