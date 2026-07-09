import 'server-only'
import { llmComplete } from '@/lib/llm'
import { looseJsonParse } from '@/lib/llm/parse'

const SYSTEM_PROMPT =
  '당신은 LG U+(엘지유플러스) 전략 분석가다. 주어진 경쟁사/시장 관련 기사가 ' +
  '**LG U+ 관점에서** 위기인지 기회인지 관망인지 판정하라. ' +
  '위기=경쟁사의 약진·우위 확대·신사업 선점·LG U+ 시장·고객 잠식 위협. ' +
  '기회=경쟁사의 부진·실패·리스크·규제 압박 등 LG U+에 유리한 틈. ' +
  '관망=중립·단순 사실·산업 전반·영향 불명확. ' +
  '**JSON만 출력**: {"impact":"위기|기회|관망"}. 설명·머리말 금지.'

export type LguImpact = '위기' | '기회' | '관망'

function keywordFallback(text: string): LguImpact | null {
  if (/위기|threat|위협/i.test(text)) return '위기'
  if (/기회|opportunity/i.test(text)) return '기회'
  if (/관망|neutral|중립/i.test(text)) return '관망'
  return null
}

export async function classifyLguImpact(
  title: string,
  snippet: string,
  competitors?: string[],
): Promise<LguImpact | null> {
  try {
    const hint = competitors?.length ? `관련 경쟁사: ${competitors.slice(0, 4).join(', ')}\n` : ''
    const user = `${hint}제목: ${title}\n발췌: ${snippet.slice(0, 300)}`
    const out = await llmComplete('classify', SYSTEM_PROMPT, user)
    if (!out) return null

    const parsed = looseJsonParse(out)
    const val = (parsed as Record<string, unknown> | null)?.impact
    if (val === '위기' || val === '기회' || val === '관망') return val

    const fallback = keywordFallback(out)
    if (fallback) return fallback

    console.warn('[lgu-impact] parse fail:', out.slice(0, 200))
    return null
  } catch {
    return null
  }
}
