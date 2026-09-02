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
  /** 누가 무엇을 했나 — 기사 사실 범위 안에서만. 60~100자. */
  what: string
  /** 왜 지금 중요한가 — 시장/경쟁 맥락. 60~100자. */
  why: string | null
  /** LG U+ B2B 관점 시사점·액션. 단정형 1문장, 60자 이내. */
  action: string | null
}

export const NEWSLETTER_CARD_INSIGHT_FALLBACK = `당신은 LG유플러스 B2B 전략팀 소속 시장 애널리스트다. 임원이 30초 안에 읽고
"그래서 우리가 뭘 해야 하는지"까지 파악할 수 있는 코멘트를 쓴다.

[사실 규칙 — 절대 위반 금지]
- what·why 에 쓰는 사실(기업명·수치·제품명·시점)은 입력된 제목·요약에 있는 것만 쓴다.
- 입력에 없는 사실을 추측해 채우지 않는다. 근거가 부족하면 그 항목은 짧게 쓰거나 null 로 둔다.
- action 은 사실 서술이 아니라 전략적 판단이므로 단정해도 된다. 단, 실재하지 않는
  LG유플러스 제품명·계약·고객사·수치를 지어내지 않는다. 일반적 방향으로만 쓴다.

[문체 규칙]
- "~할 여지가 있다", "~로 보인다", "~일 가능성이 있다", "~신호로 읽힌다" 같은 완충 표현을 쓰지 않는다.
- 단정형 평서문으로 끝낸다. ("~다", "~했다", "~해야 한다")
- 하나 마나 한 일반론("AI 시장이 커지고 있다" 류)을 쓰지 않는다. 이 기사에서만 나올 수 있는 문장을 쓴다.
- 제목·요약 문장을 그대로 복사하지 않는다. 반드시 재해석한다.

[각 항목 작성 기준]
- what : 누가(주체) 무엇을 했는지. 주체를 반드시 명시한다. 1~2문장, 60~100자.
- why  : 왜 지금 이게 중요한지 — 경쟁 구도 변화, 시장 선점, 규제, 비용구조 중 하나 이상과 연결한다. 1~2문장, 60~100자.
- action : LG유플러스 B2B가 취해야 할 방향. "모니터링한다" 같은 무의미한 액션 금지.
  대응/견제/제휴/속도/포지셔닝 중 무엇인지 구체적으로. 1문장, 60자 이내.

[출력]
- 입력된 각 기사 id 에 대해 정확히 하나의 객체를 만든다.
- 다른 설명 없이 JSON 객체 하나만 출력한다.
{"insights":[{"id":"...","what":"...","why":"...","action":"..."}]}`

function buildUserPrompt(cards: CardForInsight[]): string {
  const list = cards
    .map((c, i) => `${i + 1}. id=${c.id}\n제목: ${c.title}\n요약: ${c.summaryKo ?? '(요약 없음)'}`)
    .join('\n\n')
  return `다음 기사들에 대해 각각 인사이트를 생성해줘.\n\n${list}`
}

interface RawInsightItem {
  id?: unknown
  what?: unknown
  why?: unknown
  action?: unknown
  /** 옛 프롬프트(1문장 완충톤) 포맷 하위호환용. */
  insight?: unknown
}

function toNullableString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : null
}

/**
 * DB 프롬프트(`llm_prompts.newsletter_card_insight`)가 코드 상수를 덮어쓰므로, 아직 옛 포맷
 * (`insight` 문자열)을 반환하는 경우에도 메일이 깨지지 않도록 관대하게 파싱한다.
 */
function parseInsightItem(item: RawInsightItem): CardInsight | null {
  const what = toNullableString(item.what, 200)
  if (what) {
    return {
      what,
      why: toNullableString(item.why, 200),
      action: toNullableString(item.action, 120),
    }
  }

  // 옛 포맷 하위호환: { insight: "..." } → { what: insight, why: null, action: null }
  const legacyWhat = toNullableString(item.insight, 200)
  if (legacyWhat) {
    return { what: legacyWhat, why: null, action: null }
  }

  return null
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
