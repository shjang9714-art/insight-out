import 'server-only'

import { llmComplete } from '@/lib/llm'
import { looseJsonParse } from '@/lib/llm/parse'

// ─── 공개 타입 ────────────────────────────────────────────────────────────────

export interface BriefingHighlight {
  content_id: string
  insight: string
}

export interface HighlightInput {
  id: string
  title: string
  summary_ko: string | null
}

// ─── 프롬프트 ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  '당신은 LG유플러스 B2B 시장 인텔리전스 애널리스트다.\n' +
  '아래 오늘의 브리핑 선정 기사들을 보고, 임직원이 홈 화면에서 3초 만에 훑을 "핵심 인사이트" 3줄을 뽑아라.\n\n' +
  '반드시 지켜야 할 규칙:\n' +
  '1. 각 줄은 헤드라인 요약이 아니라 "왜 중요한가 / 무엇을 시사하는가"의 한 문장 인사이트다.\n' +
  '2. 통신·테크·AI 시장 관점(경쟁 구도·기술 동인·수요 변화·규제·B2B 기회·리스크 중 가장 잘 맞는 각도)으로 해석한다.\n' +
  '3. 각 줄은 한국어 35~55자, 명사형 종결(예: "~로 경쟁 가속", "~수요 본격화"). 마침표·이모지·따옴표 금지.\n' +
  '4. 입력에 없는 사실·수치 창작 금지. 서로 다른 기사에서 최대 3줄. 같은 기사 중복 금지.\n' +
  '5. 각 인사이트에 근거 기사의 content_id를 정확히 매핑한다. 목록에 없는 id 사용 금지.\n' +
  '6. JSON만 출력.\n\n' +
  '출력 스키마:\n' +
  '{"highlights":[{"content_id":"<입력 id>","insight":"핵심 시사점 한 줄"}]}'

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

    if (!contentId || !insight) continue
    if (!validIds.has(contentId)) continue   // 입력 밖 id 제거(환각 가드)
    if (seen.has(contentId)) continue         // 같은 기사 중복 제거
    if (insight.length < 8) continue          // 너무 짧은 한 줄 제거

    seen.add(contentId)
    results.push({ content_id: contentId, insight })
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
