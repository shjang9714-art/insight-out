import 'server-only'
import { llmCompleteDetailed } from '@/lib/llm'
import { looseJsonParse } from '@/lib/llm/parse'
import { loadPrompt } from '@/lib/prompts/load-prompt'
import { createAdminClient } from '@/lib/supabase/admin'

export interface CardForInsight {
  id: string
  title: string
  summaryKo: string | null
}

export const NEWSLETTER_CARD_INSIGHT_FALLBACK = `당신은 LG유플러스 B2B 전략팀 관점에서 뉴스 기사를 짧게 코멘트하는 애널리스트다.
아래 규칙을 반드시 지킨다.
- 입력 기사 본문(제목·요약)에 없는 사실·수치·기업명을 만들어내지 않는다.
- LG유플러스 관련 시사점은 단정하지 말고 "~여지/신호/가능성" 톤으로 표현한다.
- 각 인사이트는 1문장, 80자 이내의 한국어로 작성한다.
- 입력된 각 기사 id에 대해 정확히 하나의 인사이트를 생성한다.
- 출력은 다른 설명 없이 JSON 객체 하나만: {"insights": [{"id": "...", "insight": "..."}, ...]}`

function buildUserPrompt(cards: CardForInsight[]): string {
  const list = cards
    .map((c, i) => `${i + 1}. id=${c.id}\n제목: ${c.title}\n요약: ${c.summaryKo ?? '(요약 없음)'}`)
    .join('\n\n')
  return `다음 기사들에 대해 각각 인사이트를 생성해줘.\n\n${list}`
}

interface RawInsightItem {
  id?: unknown
  insight?: unknown
}

/**
 * 뉴스레터 카드 전체를 한 번의 LLM 호출로 묶어 인사이트를 배치 생성한다(카드별 개별 호출 금지).
 * 실패·파싱 오류 시 빈 Map을 반환 — 호출부는 인사이트 없이 기사만으로 발송하는 폴백을 취한다.
 */
export async function generateCardInsights(cards: CardForInsight[]): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (cards.length === 0) return result

  const admin = createAdminClient()
  const systemPrompt = await loadPrompt(
    admin,
    'newsletter_card_insight',
    NEWSLETTER_CARD_INSIGHT_FALLBACK,
  )
  const { text, errorReason } = await llmCompleteDetailed(
    'newsletter_card_insight',
    systemPrompt,
    buildUserPrompt(cards)
  )

  if (!text) {
    console.error('[뉴스레터/카드인사이트] LLM 호출 실패, 인사이트 없이 폴백:', errorReason)
    return result
  }

  const parsed = looseJsonParse(text) as { insights?: RawInsightItem[] } | null
  if (!parsed?.insights || !Array.isArray(parsed.insights)) {
    console.error('[뉴스레터/카드인사이트] JSON 파싱 실패, 인사이트 없이 폴백. raw:', text.slice(0, 300))
    return result
  }

  const validIds = new Set(cards.map((c) => c.id))
  for (const item of parsed.insights) {
    if (typeof item.id === 'string' && typeof item.insight === 'string' && validIds.has(item.id)) {
      result.set(item.id, item.insight.trim().slice(0, 120))
    }
  }

  return result
}
