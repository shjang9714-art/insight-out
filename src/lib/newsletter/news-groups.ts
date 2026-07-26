import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * "오늘의 주요 뉴스" 5분류 규칙 기반 매핑(§2).
 *
 * 새 LLM 호출 없이 이미 크롤링 파이프라인이 채워둔 contents.matched_groups(=keyword_groups.name)·
 * matched_keywords(=entities.canonical_name 등)와 entities.competitor_group 을 5개 버킷으로
 * 재매핑한다. 분류는 아침 payload 생성 시점(prepare-issue.ts) 1회만 실행하고 결과를
 * newsletter_issues.payload 에 저장 — 발송 루프·미리보기는 저장된 그룹 구조만 읽는다.
 */
export type NewsGroupKey = 'competitor' | 'ai_bigtech' | 'aidc_infra' | 'policy' | 'market_b2b'

export interface NewsGroupDef {
  key: NewsGroupKey
  label: string
}

export const NEWS_GROUP_DEFS: NewsGroupDef[] = [
  { key: 'competitor', label: '경쟁사(통신3사·케이블)' },
  { key: 'ai_bigtech', label: 'AI·빅테크' },
  { key: 'aidc_infra', label: 'AIDC·인프라' },
  { key: 'policy', label: '정책·규제' },
  { key: 'market_b2b', label: '시장·B2B동향' },
]

// keyword_groups.name 기준(실측값, 20260726 조회) — 우선순위 순서대로 판정한다.
// prepare-issue.ts 의 버킷별 DB 조회(overlaps 필터)도 이 배열을 그대로 사용해 분류 기준을 한 곳에서 관리한다.
export const AI_BIGTECH_GROUPS_LIST = ['AI 기술', '빅테크', '피지컬 AI']
export const AIDC_INFRA_GROUPS_LIST = ['AIDC', 'AICC']
export const POLICY_GROUPS_LIST = ['정부 규제', '정부 사업']

const AI_BIGTECH_GROUPS = new Set(AI_BIGTECH_GROUPS_LIST)
const AIDC_INFRA_GROUPS = new Set(AIDC_INFRA_GROUPS_LIST)
const POLICY_GROUPS = new Set(POLICY_GROUPS_LIST)

export interface NewsGroupClassifiable {
  matchedGroups: string[]
  matchedKeywords: string[]
}

export interface CompetitorNameSets {
  /** entities.competitor_group === '통신' (KT·SKT·SK브로드밴드·세종텔레콤 등, 케이블 포함) */
  telco: Set<string>
  /** entities.competitor_group === '클라우드·플랫폼' (NHN Cloud·카카오엔터프라이즈·네이버클라우드·KT클라우드 등) */
  cloud: Set<string>
}

/**
 * entities 에서 경쟁사 그룹별 이름 집합을 조회한다(competitor-news.ts 와 동일 소스).
 * matched_keywords 는 크롤러가 붙인 원문 표기(예: "SK텔레콤", "SKT" 둘 다 등장)라 canonical_name
 * 만으로는 누락이 생겨 entity_aliases 도 함께 합친다.
 */
export async function loadCompetitorNameSets(supabase: SupabaseClient): Promise<CompetitorNameSets> {
  const { data, error } = await supabase
    .from('entities')
    .select('id, canonical_name, competitor_group')
    .eq('is_competitor', true)
    .limit(50)

  if (error) {
    console.error('[뉴스레터/뉴스분류] 경쟁사 엔티티 조회 실패:', error.message)
    return { telco: new Set(), cloud: new Set() }
  }

  const rows = (data ?? []) as { id: string; canonical_name: string; competitor_group: string | null }[]
  const telco = new Set<string>()
  const cloud = new Set<string>()
  // 원문 표기(예: "SK텔레콤")와 소문자(예: "skt")가 matched_keywords 에 섞여 등장하므로
  // 두 표기를 모두 집합에 넣어 DB overlaps 조회·JS 매칭 양쪽에서 그대로 재사용한다.
  const addBothCases = (set: Set<string>, value: string) => {
    set.add(value)
    set.add(value.toLowerCase())
  }

  const telcoIds = new Set(rows.filter((r) => r.competitor_group === '통신').map((r) => r.id))
  const cloudIds = new Set(rows.filter((r) => r.competitor_group === '클라우드·플랫폼').map((r) => r.id))
  for (const r of rows) {
    if (r.competitor_group === '통신') addBothCases(telco, r.canonical_name)
    if (r.competitor_group === '클라우드·플랫폼') addBothCases(cloud, r.canonical_name)
  }

  const { data: aliases, error: aliasErr } = await supabase
    .from('entity_aliases')
    .select('entity_id, alias')
    .in('entity_id', rows.map((r) => r.id))

  if (aliasErr) {
    console.error('[뉴스레터/뉴스분류] 경쟁사 별칭 조회 실패:', aliasErr.message)
    return { telco, cloud }
  }

  for (const a of (aliases ?? []) as { entity_id: string; alias: string }[]) {
    if (telcoIds.has(a.entity_id)) addBothCases(telco, a.alias)
    if (cloudIds.has(a.entity_id)) addBothCases(cloud, a.alias)
  }

  return { telco, cloud }
}

/**
 * 후보 1건을 5버킷 중 하나로 분류한다. 우선순위: 통신3사·케이블 경쟁사 언급 >
 * AI·빅테크 키워드그룹 > AIDC·인프라(키워드그룹 또는 클라우드 경쟁사 언급) > 정책·규제 > 나머지(시장·B2B동향).
 */
export function classifyNewsGroup(content: NewsGroupClassifiable, names: CompetitorNameSets): NewsGroupKey {
  const groups = new Set(content.matchedGroups)
  const keywords = content.matchedKeywords

  if (keywords.some((k) => names.telco.has(k))) return 'competitor'
  if ([...groups].some((g) => AI_BIGTECH_GROUPS.has(g))) return 'ai_bigtech'
  if ([...groups].some((g) => AIDC_INFRA_GROUPS.has(g)) || keywords.some((k) => names.cloud.has(k))) return 'aidc_infra'
  if ([...groups].some((g) => POLICY_GROUPS.has(g))) return 'policy'
  return 'market_b2b'
}

/**
 * ①~④(경쟁사·AI빅테크·AIDC인프라·정책규제) 버킷은 각각 전용 DB 조회(overlaps 필터)로 직접
 * 채운다 — 하나의 공통 후보 풀에서 뽑으면 조회수 상위권을 AI 일반 기사가 독식해 특정 버킷이
 * 비어버리는 문제가 있었다(실측: 경쟁사 태그 기사가 상위 200건 중 6건뿐, 첫 등장이 57위).
 * ⑤ 시장·B2B동향은 넓은 일반 후보 풀에서 위 네 버킷 중 하나로도 분류되지 않는(=진짜 잔여) 건만
 * classifyNewsGroup 으로 걸러 채우는 catch-all이다.
 */
export function pickResidualMarketCandidates<T extends NewsGroupClassifiable & { id: string }>(
  pool: T[],
  names: CompetitorNameSets,
  excludeIds: Set<string>,
  maxCount = 2
): T[] {
  const picked: T[] = []
  for (const c of pool) {
    if (excludeIds.has(c.id)) continue
    if (classifyNewsGroup(c, names) !== 'market_b2b') continue
    picked.push(c)
    if (picked.length >= maxCount) break
  }
  return picked
}
