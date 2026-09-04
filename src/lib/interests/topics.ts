import type { SupabaseClient } from '@supabase/supabase-js'

export const NOISE_TOPIC_NAME = '노이즈 제외'

export interface SelectableTopic {
  id: string
  name: string
}

export async function fetchSelectableTopics(
  supabase: SupabaseClient,
): Promise<SelectableTopic[]> {
  const { data, error } = await supabase
    .from('keyword_groups')
    .select('id, name')
    .eq('is_active', true)
    // link_only 그룹(595-B 「엔티티 사전」)은 matched_groups에 들어가지 않아 선택해도 효과가 없다.
    .or('link_only.is.null,link_only.eq.false')
    .neq('name', NOISE_TOPIC_NAME)
    .order('name')

  if (error) throw error
  return (data ?? []) as SelectableTopic[]
}
