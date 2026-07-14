import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { llmComplete } from '@/lib/llm'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

const SYSTEM_PROMPT = `당신은 LG U+ B2B 시장 인텔리전스 분석가다.
주어진 키워드와 관련 콘텐츠 제목들을 근거로 이 키워드의 핵심 동향을 한국어 한 문장으로 요약하라.
사실 요약 톤을 유지하고, 과장·환각·입력 근거 밖 단정을 금지한다.
결과는 문장 하나만 출력하라(따옴표·번호·접두어 없이).`

interface ContentForInsight {
  title: string
}

/**
 * 지시서 B — 키워드별 LLM 핵심 인사이트 1줄. 캐시 우선(24시간 TTL)으로 비용 방지.
 * 실패 시 조용히 null 반환(호출부가 UI 숨김 처리).
 */
export async function getOrGenerateKeywordInsight(
  entityId: string,
  entityName: string,
  recentContents: ContentForInsight[]
): Promise<string | null> {
  try {
    const admin = createAdminClient()

    const { data: cached } = await admin
      .from('keyword_insight_cache')
      .select('insight_text, generated_at')
      .eq('entity_id', entityId)
      .maybeSingle()

    if (cached && Date.now() - new Date(cached.generated_at).getTime() < CACHE_TTL_MS) {
      return cached.insight_text
    }

    if (recentContents.length === 0) {
      return cached?.insight_text ?? null
    }

    const userPrompt = `키워드: ${entityName}\n\n관련 콘텐츠 제목:\n${recentContents
      .slice(0, 15)
      .map((c) => `- ${c.title}`)
      .join('\n')}`

    const text = await llmComplete('key_insight', SYSTEM_PROMPT, userPrompt)
    if (!text) return cached?.insight_text ?? null

    const insight = stripLlmArtifacts(text).trim().split('\n')[0].slice(0, 200)
    if (!insight) return cached?.insight_text ?? null

    const { error: upsertError } = await admin
      .from('keyword_insight_cache')
      .upsert(
        { entity_id: entityId, insight_text: insight, generated_at: new Date().toISOString() },
        { onConflict: 'entity_id' }
      )
    if (upsertError) {
      console.error('[KeywordInsight] 캐시 저장 실패:', upsertError.message)
    }

    return insight
  } catch (err) {
    console.error('[KeywordInsight] 생성 실패:', err instanceof Error ? err.message : String(err))
    return null
  }
}
