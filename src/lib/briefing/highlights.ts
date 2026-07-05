import 'server-only'

import { llmComplete } from '@/lib/llm'
import { looseJsonParse } from '@/lib/llm/parse'

// ─── 공개 타입 ────────────────────────────────────────────────────────────────

export interface BriefingHighlight {
  content_id: string
  keyword: string
  insight: string
}

export interface HighlightInput {
  id: string
  title: string
  summary_ko: string | null
}

// ─── 프롬프트 ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  '당신은 LG유플러스 전략기획 담당 애널리스트다. 독자는 LG유플러스 임직원이다.\n' +
  '아래 오늘의 브리핑 선정 기사들을 보고, 홈 화면에 처음 들어온 임직원이 3초 만에 "그래서 당사에 무슨 의미인가"를 깨닫게 하는 핵심 인사이트 3줄을 뽑아라.\n\n' +
  '반드시 지켜야 할 규칙:\n' +
  '1. 기사 요약·헤드라인 반복은 절대 금지. 각 줄은 반드시 한 발 더 들어간 시사점이다 — 이 사건이 LG유플러스에게 기회인가 위협인가, 무엇을 시사하고 무엇을 준비해야 하는가.\n' +
  '2. 페르소나는 LG유플러스 내부 전략가다. "당사"(LG유플러스) 관점으로 해석하되, 통신·B2B(엔터프라이즈·AIDC·AICC·영상보안·AI인프라) 사업 각도를 우선한다. 억지로 통신을 끼워 맞추지 말고, 자연스러운 각도(경쟁 구도·기술 동인·수요 변화·규제·리스크)를 하나 골라 날카롭게 짚어라.\n' +
  '3. 각 인사이트는 두 부분이다: (a) keyword — 그 줄의 본질을 찌르는 임팩트 키워드 2~7자(예: 경쟁 격화, AIDC 선점, 규제 리스크, 탈통신 가속, 수요 폭발). 대괄호·기호·조사 없이 단어만. (b) insight — 한국어 30~55자, 명사형 종결(예: "~로 당사 B2B 반격 카드 필요", "~선점 경쟁 격화 대응 시급"). 마침표·이모지·따옴표 금지. 밋밋한 서술 말고 임팩트 있게.\n' +
  '4. 입력에 없는 사실·수치 창작 금지. 반드시 서로 다른 기사에서 정확히 3줄을 뽑아라(입력 기사가 3건 미만일 때만 그만큼). 같은 기사 중복 금지.\n' +
  '5. 각 인사이트에 근거 기사의 content_id를 정확히 매핑한다. 목록에 없는 id 사용 금지.\n' +
  '6. JSON만 출력.\n\n' +
  '출력 스키마:\n' +
  '{"highlights":[{"content_id":"<입력 id>","keyword":"임팩트 키워드","insight":"LG유플러스 관점 핵심 시사점 한 줄"}]}'

function buildUserPrompt(articles: HighlightInput[]): string {
  const lines = articles.map(a => {
    const summary = (a.summary_ko ?? '').replace(/\s+/g, ' ').trim().slice(0, 300)
    return `id=${a.id}\n제목: ${a.title}${summary ? `\n요약: ${summary}` : ''}`
  })
  return `선정 기사 ${articles.length}건:\n\n${lines.join('\n\n')}`
}

// ─── 파싱·환각 가드 ───────────────────────────────────────────────────────────

function parseAndValidate(raw: string, validIds: Set<string>): BriefingHighlight[] {
  const parsed = looseJsonParse(raw)
  if (!parsed || typeof parsed !== 'object') return []

  const list = (parsed as Record<string, unknown>).highlights
  if (!Array.isArray(list)) return []

  const seen = new Set<string>()
  const results: BriefingHighlight[] = []

  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const h = item as Record<string, unknown>

    const contentId = typeof h.content_id === 'string' ? h.content_id.trim() : ''
    const insight = typeof h.insight === 'string' ? h.insight.trim() : ''
    // 키워드: 대괄호·따옴표 등 장식 제거 후 12자 이내로 절단. 없으면 빈 문자열(카드에서 태그 숨김).
    const keyword = typeof h.keyword === 'string'
      ? h.keyword.trim().replace(/^[[\("'‘“]+|[\]\)"'’”]+$/g, '').trim().slice(0, 12)
      : ''

    if (!contentId || !insight) continue
    if (!validIds.has(contentId)) continue   // 입력 밖 id 제거(환각 가드)
    if (seen.has(contentId)) continue         // 같은 기사 중복 제거
    if (insight.length < 8) continue          // 너무 짧은 한 줄 제거

    seen.add(contentId)
    results.push({ content_id: contentId, keyword, insight })
    if (results.length >= 3) break
  }

  return results
}

// ─── 메인 함수 ────────────────────────────────────────────────────────────────
// 선정 기사에서 홈 카드용 핵심 인사이트 3줄을 생성. 실패 시 빈 배열(호출부는 폴백).

export async function generateHighlights(
  articles: HighlightInput[]
): Promise<BriefingHighlight[]> {
  try {
    const usable = articles.filter(a => a.id && a.title)
    if (usable.length === 0) return []

    const validIds = new Set(usable.map(a => a.id))
    const raw = await llmComplete('summarize', SYSTEM_PROMPT, buildUserPrompt(usable))
    if (!raw) return []

    return parseAndValidate(raw, validIds)
  } catch (err) {
    console.error('[generateHighlights] 오류:', err instanceof Error ? err.message : String(err))
    return []
  }
}
