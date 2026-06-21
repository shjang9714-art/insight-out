import 'server-only'
import { llmComplete } from '@/lib/llm'
import { looseJsonParse } from '@/lib/llm/parse'

const CLASSIFY_SNIPPET_MAXCHARS = 300
const MAX_LLM_TAGS = 3

function buildSystemPrompt(groupNames: string[]): string {
  const groupList = groupNames.length > 0
    ? `\n관심 그룹: ${groupNames.join(', ')}`
    : ''
  return (
    '당신은 B2B 텔레콤/엔터프라이즈 시장 정보 큐레이터다. ' +
    '기사가 LG U+ B2B 서비스 담당자에게 관련 있는지 판정하고, ' +
    '핵심 주제 태그를 0~3개(한국어 명사) 부여하라.' +
    groupList +
    ' **JSON만 출력**: {"relevant":true|false,"tags":["..."]}. 설명·머리말 금지.'
  )
}

/**
 * LLM 으로 기사 관련도를 재판정하고 보조 태그를 반환한다.
 * 키 미등록·한도·실패·JSON 파싱 오류 시 null 반환(결정적 판정 유지).
 */
export async function classifyRelevance(
  title: string,
  snippet: string,
  groupNames: string[]
): Promise<{ relevant: boolean; tags: string[] } | null> {
  try {
    const system = buildSystemPrompt(groupNames)
    const user = `제목: ${title}\n발췌: ${snippet.slice(0, CLASSIFY_SNIPPET_MAXCHARS)}`

    const out = await llmComplete('classify', system, user)
    if (!out) return null

    const parsed = looseJsonParse(out)

    if (parsed === null) {
      console.warn('[classify] parse fail:', out.slice(0, 200))
      return null
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>).relevant !== 'boolean'
    ) {
      return null
    }

    const obj = parsed as Record<string, unknown>
    const rawTags = Array.isArray(obj.tags) ? obj.tags : []
    const tags = (rawTags as unknown[])
      .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      .map((t) => t.trim())
      .filter((t, i, arr) => arr.indexOf(t) === i)  // 중복 제거
      .slice(0, MAX_LLM_TAGS)

    return { relevant: Boolean(obj.relevant), tags }
  } catch (e) {
    console.error('[분류] 관련도 재판정 실패:', e)
    return null
  }
}
