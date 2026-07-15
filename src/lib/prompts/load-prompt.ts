import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

/** 프롬프트 콘솔 저장값을 우선 사용하고, 테이블 미적용·조회 실패 시 코드 상수로 폴백한다. */
export async function loadPrompt(
  admin: SupabaseClient,
  key: string,
  fallback: string,
): Promise<string> {
  try {
    const { data, error } = await admin
      .from('llm_prompts')
      .select('prompt_text')
      .eq('key', key)
      .maybeSingle()
    if (!error && typeof data?.prompt_text === 'string' && data.prompt_text.trim()) {
      return data.prompt_text
    }
  } catch {
    // 프롬프트 테이블이 없거나 일시적으로 조회할 수 없으면 코드 상수를 사용한다.
  }
  return fallback
}
