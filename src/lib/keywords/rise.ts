import 'server-only'

import { getKeywordRelated, type KeywordArticle } from '@/lib/keywords/detail'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const MAX_FACTS = 60
const NUMBER_TOKEN = /\d[\d,.]*\s*(?:조|억|만|GW|MW|kW|%|건|명|년|월)/g

export interface RiseFact {
  evt_id: string
  event: string
  date: string
  source: string
  content_id: string
  numbers: Record<string, string>
}

export interface RiseFactor {
  thesis: string
  detail: string
  evidence: string[]
}

export interface VerifiedRiseFactors {
  overview: string
  factors: RiseFactor[]
}

export interface RiseFactorSet extends VerifiedRiseFactors {
  keyword: string
  displayName: string
  generatedAt: string
  status: 'draft' | 'published'
}

export interface RiseVerifyReport {
  dropped: { slot: string; text: string; reason: string }[]
  warnings: { slot: string; text: string; reason: string }[]
}

interface RiseFactorRow {
  keyword: string
  display_name: string
  overview: string
  factors: unknown
  generated_at: string
  status: string
}

function normalizeKeyword(name: string): string {
  return name.trim().toLocaleLowerCase('ko-KR')
}

function getKstDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value.slice(0, 10)
    : new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10)
}

function extractNumbers(text: string): Record<string, string> {
  return Object.fromEntries(
    Array.from(new Set(text.match(NUMBER_TOKEN) ?? [])).map((number, index) => [
      `number_${index + 1}`,
      number.trim(),
    ]),
  )
}

function articleDate(article: KeywordArticle): string {
  return getKstDate(article.publishedAt ?? article.collectedAt)
}

/** 패스① — 해석 없이 최근 기사와 연결된 사건을 근거 사실 목록으로 바꾼다. */
export async function buildRiseFacts(name: string): Promise<RiseFact[]> {
  const related = await getKeywordRelated(name)
  const articleById = new Map(related.articles.map((article) => [article.id, article]))
  const candidates: Omit<RiseFact, 'evt_id'>[] = []
  const usedContentIds = new Set<string>()

  for (const event of related.events) {
    const article = event.citations
      .map((contentId) => articleById.get(contentId))
      .find((item): item is KeywordArticle => Boolean(item))
    if (!article || usedContentIds.has(article.id)) continue

    const eventText = [event.headline, event.detail].filter(Boolean).join(' — ')
    candidates.push({
      event: eventText,
      date: event.event_date,
      source: article.sourceName ?? '출처 미상',
      content_id: article.id,
      numbers: extractNumbers(eventText),
    })
    usedContentIds.add(article.id)
  }

  for (const article of related.articles) {
    if (usedContentIds.has(article.id)) continue
    const eventText = [article.title, article.summary].filter(Boolean).join(' — ')
    candidates.push({
      event: eventText,
      date: articleDate(article),
      source: article.sourceName ?? '출처 미상',
      content_id: article.id,
      numbers: extractNumbers(eventText),
    })
  }

  return candidates
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_FACTS)
    .map((fact, index) => ({ ...fact, evt_id: `evt_${String(index + 1).padStart(3, '0')}` }))
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

/** 패스③ — 모든 근거 evt_id가 실제 사실 목록에 있는 요인만 저장 형태로 변환한다. */
export function verifyRiseFactors(
  facts: RiseFact[],
  input: unknown,
): { verified: VerifiedRiseFactors; report: RiseVerifyReport } {
  const report: RiseVerifyReport = { dropped: [], warnings: [] }
  const factById = new Map(facts.map((fact) => [fact.evt_id, fact]))
  const evidenceNumbers = facts
    .map((fact) => `${fact.event} ${Object.values(fact.numbers).join(' ')}`)
    .join(' ')
    .replace(/\s+/g, '')
  const root = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const factors: RiseFactor[] = []

  for (const [index, raw] of (Array.isArray(root.factors) ? root.factors : []).entries()) {
    const factor = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    const thesis = text(factor.thesis)
    const detail = text(factor.detail)
    const evidenceIds = stringArray(factor.evidence)
    const slot = `요인 ${index + 1}`
    if (!thesis) continue
    if (evidenceIds.length === 0) {
      report.dropped.push({ slot, text: thesis, reason: '근거(evidence) 없음' })
      continue
    }

    const invalidIds = evidenceIds.filter((id) => !factById.has(id))
    if (invalidIds.length > 0) {
      report.dropped.push({
        slot,
        text: thesis,
        reason: `존재하지 않는 사건 참조: ${invalidIds.join(', ')}`,
      })
      continue
    }

    for (const number of `${thesis} ${detail}`.match(NUMBER_TOKEN) ?? []) {
      if (!evidenceNumbers.includes(number.replace(/\s+/g, ''))) {
        report.warnings.push({ slot, text: number, reason: '근거 사건에 없는 수치' })
      }
    }

    const contentIds = Array.from(new Set(
      evidenceIds.map((id) => factById.get(id)?.content_id).filter((id): id is string => Boolean(id)),
    ))
    if (contentIds.length === 0) {
      report.dropped.push({ slot, text: thesis, reason: '연결된 콘텐츠 근거 없음' })
      continue
    }
    factors.push({ thesis, detail, evidence: contentIds })
  }

  return {
    verified: { overview: text(root.overview), factors },
    report,
  }
}

function parseStoredFactors(value: unknown): RiseFactor[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return []
    const factor = raw as Record<string, unknown>
    const thesis = text(factor.thesis)
    const evidence = stringArray(factor.evidence)
    if (!thesis || evidence.length === 0) return []
    return [{ thesis, detail: text(factor.detail), evidence }]
  })
}

function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === '42P01'
}

/** SQL 미적용 환경에서는 null을 반환해 상세 화면이 placeholder로 폴백한다. */
export async function getRiseFactors(name: string): Promise<RiseFactorSet | null> {
  const keyword = normalizeKeyword(name)
  if (!keyword) return null
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('keyword_rise_factors')
    .select('keyword, display_name, overview, factors, generated_at, status')
    .eq('keyword', keyword)
    .maybeSingle()

  if (error) {
    if (isMissingTable(error)) return null
    console.error('[키워드 상승 요인] 조회 오류:', error.message)
    return null
  }
  if (!data) return null

  const row = data as unknown as RiseFactorRow
  const factors = parseStoredFactors(row.factors)
  if (factors.length === 0) return null
  return {
    keyword: row.keyword,
    displayName: row.display_name,
    overview: row.overview,
    factors,
    generatedAt: row.generated_at,
    status: row.status === 'published' ? 'published' : 'draft',
  }
}

/** 검증을 통과한 근거 콘텐츠 ID만 키워드별 최신 세트로 저장한다. */
export async function saveRiseFactors(
  name: string,
  verified: VerifiedRiseFactors,
): Promise<void> {
  const displayName = name.trim()
  const keyword = normalizeKeyword(displayName)
  if (!keyword) throw new Error('키워드를 입력해주세요.')
  if (verified.factors.length === 0 || verified.factors.some((factor) => factor.evidence.length === 0)) {
    throw new Error('유효한 콘텐츠 근거가 있는 상승 요인이 없습니다.')
  }

  const admin = createAdminClient()
  const { error } = await admin.from('keyword_rise_factors').upsert({
    keyword,
    display_name: displayName,
    overview: verified.overview,
    factors: verified.factors,
    generated_at: new Date().toISOString(),
    status: 'draft',
  }, { onConflict: 'keyword' })

  if (error) {
    if (isMissingTable(error)) {
      throw new Error('keyword_rise_factors 테이블이 없습니다. 351C SQL을 먼저 적용해주세요.')
    }
    throw new Error(`키워드 상승 요인 저장 실패: ${error.message}`)
  }
}
