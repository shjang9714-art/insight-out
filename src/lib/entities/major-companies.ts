import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { InsightCard } from '@/lib/types'
import { computeImportance } from '@/lib/insight/card-meta'

export interface MajorCompanyCard {
  company: string
  card: InsightCard
  hashtags: string[]
  isGold: boolean
}

export interface MajorGroupBucket {
  key: string
  label: string
  /** 이슈 중요도(computeImportance) desc → 최신순. 전체 회사(카드 있는 곳만). */
  companies: MajorCompanyCard[]
  /** 사용자가 이 그룹에서 직접 고른 회사명(원본 표기) — 없으면 대표는 중요도 top5 기본 */
  userPicked: string[]
}

export interface MajorCompanyWeek {
  weekStart: string
  weekEnd: string
}

export interface MajorCompaniesData {
  groups: MajorGroupBucket[]
  /** curated_groups/curated_companies(253) 미적용 여부 — graceful 안내 문구 분기용 */
  curatedApplied: boolean
  /** 신규 주간 경계(월~일)로 생성된 가용 주 목록 — 최신순 */
  availableWeeks: MajorCompanyWeek[]
  /** 요청 주가 가용하지 않으면 최신 가용 주로 폴백 */
  selectedWeek: string | null
}

interface CuratedGroupRow { key: string; label: string; sort_order: number }
interface CuratedCompanyRow { name: string; aliases: string[] | null; groups: string[] | null }

const MAX_HASHTAGS = 4
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function addDaysToDateString(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function isWeeklyPeriod(periodStart: string, periodEnd: string): boolean {
  if (!DATE_PATTERN.test(periodStart) || !DATE_PATTERN.test(periodEnd)) return false
  const start = new Date(`${periodStart}T00:00:00Z`)
  return !Number.isNaN(start.getTime())
    && start.getUTCDay() === 1
    && addDaysToDateString(periodStart, 6) === periodEnd
}

/**
 * 주요 기업 계층 데이터(255) — curated_groups(kind='watchlist')·curated_companies(253) +
 * 회사별 최신 insight_cards(scope='company', topic=curated name) 조인.
 * 253/254 미적용 시 curatedApplied=false로 graceful(빈 화면 안내는 호출부).
 */
export async function getMajorCompaniesData(
  supabase: SupabaseClient,
  opts: { userId?: string; weekStart?: string; includeEmptyGroups?: boolean } = {},
): Promise<MajorCompaniesData> {
  const [groupsRes, companiesRes] = await Promise.all([
    supabase
      .from('curated_groups')
      .select('key, label, sort_order')
      .eq('kind', 'watchlist')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('curated_companies')
      .select('name, aliases, groups')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  ])

  if (groupsRes.error?.code === '42P01' || companiesRes.error?.code === '42P01') {
    return { groups: [], curatedApplied: false, availableWeeks: [], selectedWeek: null }
  }
  if (groupsRes.error || companiesRes.error) {
    console.error('[major-companies] curated 조회 실패:', groupsRes.error?.message ?? companiesRes.error?.message)
    return { groups: [], curatedApplied: false, availableWeeks: [], selectedWeek: null }
  }

  const curatedGroups = (groupsRes.data ?? []) as CuratedGroupRow[]
  const curatedCompanies = (companiesRes.data ?? []) as CuratedCompanyRow[]
  if (curatedGroups.length === 0 || curatedCompanies.length === 0) {
    return { groups: [], curatedApplied: true, availableWeeks: [], selectedWeek: null }
  }

  const groupLabelByKey = new Map(curatedGroups.map(g => [g.key, g.label]))
  const companyNameLower = new Set(curatedCompanies.map(c => c.name.toLowerCase()))

  // 446 — 과거 롤링 카드가 섞여 있으므로 정확한 월~일 기간만 주간 아카이브로 인정한다.
  const { data: rawPeriods, error: periodsError } = await supabase
    .from('insight_cards')
    .select('period_start, period_end')
    .eq('status', 'published')
    .eq('scope', 'company')
    .order('period_start', { ascending: false })
    .limit(1000)

  if (periodsError) {
    console.error('[major-companies] 가용 주 조회 실패:', periodsError.message)
  }

  const weekByStart = new Map<string, MajorCompanyWeek>()
  for (const row of (rawPeriods ?? []) as { period_start: string; period_end: string }[]) {
    if (!isWeeklyPeriod(row.period_start, row.period_end) || weekByStart.has(row.period_start)) continue
    weekByStart.set(row.period_start, {
      weekStart: row.period_start,
      weekEnd: row.period_end,
    })
  }
  const availableWeeks = [...weekByStart.values()]
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
  const selectedWeek = opts.weekStart && weekByStart.has(opts.weekStart)
    ? opts.weekStart
    : (availableWeeks[0]?.weekStart ?? null)
  const selectedWeekEnd = selectedWeek ? weekByStart.get(selectedWeek)?.weekEnd : undefined

  // 회사별 선택 주 company 카드(topic=curated name 정확 매칭 — 254가 topic을 curated name으로 저장)
  let rawCards: unknown[] = []
  if (selectedWeek && selectedWeekEnd) {
    const cardsRes = await supabase
      .from('insight_cards')
      .select('id, period_start, period_end, scope, topic, headline, card_headline, implication, source_content_ids, citations, generated_at, status')
      .eq('status', 'published')
      .eq('scope', 'company')
      .eq('period_start', selectedWeek)
      .eq('period_end', selectedWeekEnd)
      .order('generated_at', { ascending: false })
      .limit(200)

    if (cardsRes.error) {
      console.error('[major-companies] 선택 주 카드 조회 실패:', cardsRes.error.message)
    } else {
      rawCards = cardsRes.data ?? []
    }
  }

  const cardByCompanyLower = new Map<string, InsightCard>()
  for (const card of rawCards as InsightCard[]) {
    const key = card.topic?.toLowerCase()
    if (!key || !companyNameLower.has(key)) continue
    if (!cardByCompanyLower.has(key)) cardByCompanyLower.set(key, card) // 이미 최신순 정렬됨 → 첫 등장만
  }

  // 해시태그 — 카드 근거 기사의 matched_groups 집계(최대 4)
  const allSourceIds = new Set<string>()
  for (const card of cardByCompanyLower.values()) {
    for (const id of card.source_content_ids) allSourceIds.add(id)
    for (const c of card.citations) allSourceIds.add(c.content_id)
  }
  const matchedGroupsByContentId = new Map<string, string[]>()
  if (allSourceIds.size > 0) {
    const { data: contentRows } = await supabase
      .from('contents')
      .select('id, matched_groups')
      .in('id', [...allSourceIds])
    for (const row of (contentRows ?? []) as { id: string; matched_groups: string[] | null }[]) {
      matchedGroupsByContentId.set(row.id, row.matched_groups ?? [])
    }
  }

  function hashtagsFor(card: InsightCard): string[] {
    const freq = new Map<string, number>()
    const ids = [...new Set([...card.source_content_ids, ...card.citations.map(c => c.content_id)])]
    for (const id of ids) {
      for (const g of matchedGroupsByContentId.get(id) ?? []) {
        freq.set(g, (freq.get(g) ?? 0) + 1)
      }
    }
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_HASHTAGS).map(([g]) => g)
  }

  // 사용자 선택(225 user_watchlist 재사용) — curated 이름과 매칭되는 것만 "대표 선택"으로 인정
  const userPickedLower = new Set<string>()
  if (opts.userId) {
    const { data: watchRows } = await supabase
      .from('user_watchlist')
      .select('company')
      .eq('user_id', opts.userId)
    for (const row of (watchRows ?? []) as { company: string }[]) {
      const lower = row.company.toLowerCase()
      if (companyNameLower.has(lower)) userPickedLower.add(lower)
    }
  }

  // 그룹별 버킷팅 — 회사는 groups[]에 속한 모든 watchlist 그룹에 나타날 수 있음
  const byGroup = new Map<string, MajorCompanyCard[]>()
  const pickedByGroup = new Map<string, string[]>()
  for (const company of curatedCompanies) {
    const key = company.name.toLowerCase()
    const card = cardByCompanyLower.get(key)
    if (!card) continue // 카드 있는 회사만 노출(255 §2-1)

    const importance = computeImportance(card)
    const entry: MajorCompanyCard = {
      company: company.name,
      card,
      hashtags: hashtagsFor(card),
      isGold: importance === 'high',
    }

    for (const groupKey of company.groups ?? []) {
      if (!groupLabelByKey.has(groupKey)) continue
      if (!byGroup.has(groupKey)) byGroup.set(groupKey, [])
      byGroup.get(groupKey)!.push(entry)
      if (userPickedLower.has(key)) {
        if (!pickedByGroup.has(groupKey)) pickedByGroup.set(groupKey, [])
        pickedByGroup.get(groupKey)!.push(company.name)
      }
    }
  }

  const groups: MajorGroupBucket[] = []
  for (const g of curatedGroups) {
    const companies = byGroup.get(g.key) ?? []
    if (companies.length === 0 && !opts.includeEmptyGroups) continue
    // 이슈 중요도(high>mid>low) desc → 최신(period_start) desc
    const rank = { high: 0, mid: 1, low: 2 } as const
    companies.sort((a, b) => {
      const r = rank[computeImportance(a.card)] - rank[computeImportance(b.card)]
      if (r !== 0) return r
      return b.card.period_start.localeCompare(a.card.period_start)
    })
    groups.push({
      key: g.key,
      label: g.label,
      companies,
      userPicked: pickedByGroup.get(g.key) ?? [],
    })
  }

  return { groups, curatedApplied: true, availableWeeks, selectedWeek }
}
