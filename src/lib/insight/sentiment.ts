import 'server-only'
import { llmComplete } from '@/lib/llm'
import { looseJsonParse } from '@/lib/llm/parse'

const SYSTEM_PROMPT =
  '당신은 B2B 텔레콤/엔터프라이즈 시장 분석가다. 주어진 경쟁사 관련 기사의 **논조**를 시장 관점에서 판정하라. ' +
  '긍정=해당 기업에 호재/성과/성공적 평가, 부정=악재/문제/실패/리스크, 중립=사실 전달·혼재. ' +
  '**JSON만 출력**: {"sentiment":"긍정|중립|부정"}. 설명·머리말 금지.'

type SentimentValue = '긍정' | '중립' | '부정'

function keywordFallback(text: string): SentimentValue | null {
  const t = text
  if (/부정|negative/i.test(t)) return '부정'
  if (/긍정|positive/i.test(t)) return '긍정'
  if (/중립|neutral/i.test(t)) return '중립'
  return null
}

export async function classifySentiment(
  title: string,
  snippet: string,
): Promise<SentimentValue | null> {
  try {
    const user = `제목: ${title}\n발췌: ${snippet.slice(0, 300)}`
    const out = await llmComplete('classify', SYSTEM_PROMPT, user)
    if (!out) return null

    const parsed = looseJsonParse(out)
    const val = (parsed as Record<string, unknown> | null)?.sentiment
    if (val === '긍정' || val === '중립' || val === '부정') return val

    const fallback = keywordFallback(out)
    if (fallback) return fallback

    console.warn('[sentiment] parse fail:', out.slice(0, 200))
    return null
  } catch {
    return null
  }
}
