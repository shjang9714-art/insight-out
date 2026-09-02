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

export interface CardInsight {
  /** 왜 지금 봐야 하는가 — 시장/경쟁 맥락. 2문장, 120~160자. */
  why: string
  /** LG U+ B2B 관점 시사점·액션. 3문장, 160~220자. */
  action: string | null
}

export const NEWSLETTER_CARD_INSIGHT_FALLBACK = `당신은 LG유플러스 B2B 전략팀 소속 시장 애널리스트다. 임원이 30초 안에 읽고
"그래서 우리가 뭘 해야 하는지"까지 파악할 수 있는 코멘트를 쓴다.

기사 제목과 요약은 이 코멘트 바로 위에 이미 노출된다.
따라서 사실을 다시 요약하지 않는다. 요약만 읽어서는 알 수 없는 해석과 판단만 쓴다.

[사실 규칙 — 절대 위반 금지]
- 인용하는 사실(기업명·수치·제품명·시점)은 입력된 제목·요약에 있는 것만 쓴다.
- 입력에 없는 사실을 추측해 채우지 않는다.
- action 은 사실 서술이 아니라 전략적 판단이므로 단정해도 된다. 단, 실재하지 않는
  LG유플러스 제품명·계약·고객사·수치를 지어내지 않는다. 일반적 방향으로만 쓴다.

[문체 규칙]
- "~할 여지가 있다", "~로 보인다", "~일 가능성이 있다", "~신호로 읽힌다" 같은 완충 표현을 쓰지 않는다.
- 단정형 평서문으로 끝낸다. ("~다", "~했다", "~해야 한다")
- 하나 마나 한 일반론("AI 시장이 커지고 있다" 류)을 쓰지 않는다. 이 기사에서만 나올 수 있는 문장을 쓴다.
- 제목·요약 문장을 그대로 옮기거나 말만 바꿔 쓰지 않는다.

[각 항목 작성 기준]
- why : 이 기사를 왜 지금 봐야 하는지 판을 읽어준다. 경쟁 구도 변화, 시장 선점,
  규제, 비용구조 중 하나 이상과 연결한다. 정확히 2문장, 120~160자.
- action : LG유플러스 B2B가 취해야 할 방향. 정확히 3문장, 160~220자.
  1문장 = 무엇을 해야 하는가(방향).
  2문장 = 왜 그 방향인가(근거·제약).
  3문장 = 이번 분기 안에 착수할 구체적 행동.
  "모니터링한다", "검토가 필요하다" 같은 무의미한 액션 금지.
  대응/견제/제휴/속도/포지셔닝 중 무엇인지 분명히 한다.

[출력]
- 입력된 각 기사 id 에 대해 정확히 하나의 객체를 만든다.
- 다른 설명 없이 JSON 객체 하나만 출력한다.
{"insights":[{"id":"...","why":"...","action":"..."}]}`

function buildUserPrompt(cards: CardForInsight[]): string {
  const list = cards
    .map((c, i) => `${i + 1}. id=${c.id}\n제목: ${c.title}\n요약: ${c.summaryKo ?? '(요약 없음)'}`)
    .join('\n\n')
  return `다음 기사들에 대해 각각 인사이트를 생성해줘.\n\n${list}`
}

interface RawInsightItem {
  id?: unknown
  /** 옛 3라벨 포맷(지시서 20260902 §2) 하위호환용. */
  what?: unknown
  why?: unknown
  action?: unknown
  /** 그보다 옛 1문장 완충톤 포맷 하위호환용. */
  insight?: unknown
}

function toNullableString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : null
}

/**
 * DB 프롬프트(`llm_prompts.newsletter_card_insight`)가 코드 상수를 덮어쓰므로, 아직 옛 포맷
 * (`what`/`insight`)을 반환하는 경우에도 메일이 깨지지 않도록 관대하게 파싱한다.
 */
function parseInsightItem(item: RawInsightItem): CardInsight | null {
  const why =
    toNullableString(item.why, 400) ?? toNullableString(item.what, 400) ?? toNullableString(item.insight, 400)
  if (!why) return null

  return {
    why,
    action: toNullableString(item.action, 400),
  }
}

/**
 * 뉴스레터 카드 전체를 한 번의 LLM 호출로 묶어 인사이트를 배치 생성한다(카드별 개별 호출 금지).
 * 실패·파싱 오류 시 빈 Map을 반환 — 호출부는 인사이트 없이 기사만으로 발송하는 폴백을 취한다.
 */
export async function generateCardInsights(cards: CardForInsight[]): Promise<Map<string, CardInsight>> {
  const result = new Map<string, CardInsight>()
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
    if (typeof item.id !== 'string' || !validIds.has(item.id)) continue
    const insight = parseInsightItem(item)
    if (insight) result.set(item.id, insight)
  }

  return result
}
