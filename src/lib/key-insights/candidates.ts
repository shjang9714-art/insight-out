import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { isBriefingRelevant } from '@/lib/feed-blocklist'
import { KEY_INSIGHT_CATEGORIES, type KeyInsightCategory } from '@/lib/key-insights/constants'

// ─── 가이드 §1의 7개 주제 카테고리 (고정 순서 = 우선순위) ────────────────────
// 지시서: docs/sonnet-지시서/(2026-07-08) "주목하세요, 핵심 Insight" 주간 파이프라인 §3-1
// 실제 정의는 constants.ts(server-only 가드 없음) — 클라이언트 컴포넌트도 같이 참조하기 위함.
export { KEY_INSIGHT_CATEGORIES }
export type { KeyInsightCategory }

// keyword_groups.name(matched_groups 에 저장된 한글 라벨) → 카테고리 매핑.
// '자사·통신사 동향'과 '사이버보안'은 아래 별도 로직(entity·보안태그)으로 우선 판정하므로 제외.
const GROUP_NAME_TO_CATEGORY: Record<string, KeyInsightCategory> = {
  'AIDC': 'AIDC·클라우드',
  'AICC': 'AICC·비즈콜',
  '통신 B2B': '통신사업·커넥티비티',
  '모빌리티': '통신사업·커넥티비티',
  'CCTV·영상보안': '통신사업·커넥티비티',
  '정부 사업': '정책·정부',
  '정부 규제': '정책·정부',
  '빅테크': '빅테크·One LG',
}

const SECURITY_GROUP_NAME = '사이버보안'
const NOISE_LABEL = '노이즈 제외'

/**
 * timestamptz(UTC) → KST 기준 'YYYY-MM-DD'.
 * key_insights.published_at 은 date 컬럼이라, UTC 문자열을 그대로 넘기면
 * Postgres 가 UTC 기준으로 잘라 KST 00~09시 발행 기사가 하루 당겨진다.
 */
function toKstDateString(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d)
}

// 자사·경쟁 통신 3사 — content_entities 직접 매칭(키워드그룹 '경쟁사'는 에스원·카카오 등도
// 섞여 있어 부정확 → entities.canonical_name 으로 좁힌다).
const TELECOM_COMPANY_NAMES = ['LG유플러스', 'SKT', 'KT', 'SK브로드밴드'] as const

/** 후보 프리필터 임계값 — 중요도 0.6 미만(0.00 정크 포함)은 하드 제외. */
const IMPORTANCE_THRESHOLD = 0.6
const WINDOW_DAYS = 7

export interface PastArticleRef {
  contentId: string
  title: string
  sourceName: string
  publishedAt: string | null
  url: string | null
}

export interface KeyInsightCandidate {
  contentId: string
  title: string
  summaryKo: string | null
  sourceName: string
  publishedAt: string | null
  originalUrl: string | null
  importanceScore: number
  issueId: string | null
  suggestedCategory: KeyInsightCategory | null
  companies: string[]
  /** 같은 이슈의 창(window) 이전 과거 콘텐츠 — LLM 이 이 안에서만 관련기사 인용 가능(환각 가드). */
  pastArticles: PastArticleRef[]
}

export interface CandidatePoolResult {
  windowStart: string
  candidates: KeyInsightCandidate[]
  stats: {
    rawCount: number
    afterNoiseAndBlocklist: number
    afterImportanceFilter: number
    afterIssueDedup: number
    byCategory: Record<string, number>
  }
}

/**
 * §3-1 후보 조회 + 프리필터 + 7개 카테고리 버킷팅 + 이슈 단위 대표 1건 통합.
 * LLM 호출 전 순수 DB 조회 단계 — generate.ts 가 이 풀을 그대로 프롬프트에 싣는다.
 * @param opts.windowDays 조회 창(일). 기본값은 주간 배치용 WINDOW_DAYS(7) — 일일 종합
 *   파이프라인(daily-insights)이 1을 넘겨 "그날 발행분"으로 좁힐 때만 사용, 나머지 로직은 불변.
 */
export async function buildCandidatePool(opts?: { windowDays?: number }): Promise<CandidatePoolResult> {
  const admin = createAdminClient()
  const windowDays = opts?.windowDays ?? WINDOW_DAYS
  const windowStart = new Date(Date.now() - windowDays * 24 * 3600 * 1000).toISOString()

  const { data: rawContents, error } = await admin
    .from('contents')
    .select('id, title, summary_ko, category, matched_groups, published_at, collected_at, original_url, importance_score, source_id')
    .eq('status', 'published')
    .or(`published_at.gte.${windowStart},and(published_at.is.null,collected_at.gte.${windowStart})`)
    .limit(3000)

  if (error) throw new Error(`후보 조회 실패: ${error.message}`)

  const rawCount = rawContents?.length ?? 0

  const relevant = (rawContents ?? []).filter(
    (c) => !(c.matched_groups ?? []).includes(NOISE_LABEL) && isBriefingRelevant(c.title, c.summary_ko)
  )
  const afterNoiseAndBlocklist = relevant.length

  const scored = relevant.filter((c) => (c.importance_score ?? 0) >= IMPORTANCE_THRESHOLD)
  const afterImportanceFilter = scored.length

  const ids = scored.map((c) => c.id)
  if (ids.length === 0) {
    return {
      windowStart,
      candidates: [],
      stats: { rawCount, afterNoiseAndBlocklist, afterImportanceFilter: 0, afterIssueDedup: 0, byCategory: {} },
    }
  }

  const [{ data: sources }, { data: issueRows }, { data: telecomEntities }] = await Promise.all([
    admin.from('sources').select('id, name'),
    admin.from('issue_contents').select('content_id, issue_id').in('content_id', ids),
    admin.from('entities').select('id, canonical_name').in('canonical_name', [...TELECOM_COMPANY_NAMES]),
  ])

  const sourceMap = new Map((sources ?? []).map((s) => [s.id, s.name as string]))

  // ── 이슈 멤버십 신뢰도 가드 ──────────────────────────────────────────────────
  // 2026-07-08 이슈 클러스터링 도입 이후 content_id 1건이 issue_id 11~22개에 동시
  // 연결되는 데이터 이상이 관찰됨(원인 미조사·별도 과제). 정상적인 근접중복 클러스터는
  // 대개 2~4건(같은 사안을 다루는 매체 수)이므로, 그보다 훨씬 큰 클러스터는 "같은 이슈"라는
  // 판단 자체를 신뢰하지 않는다 — 신뢰 못 할 이슈로 대표 1건 통합을 걸면 서로 무관한 좋은
  // 후보가 임의로 탈락한다(관찰된 사례: KT 토큰팩토리·랜섬웨어·강원 AI DC 기사가 이렇게 소실됨).
  const MAX_TRUSTED_ISSUE_CLUSTER_SIZE = 4

  const issueIdsByContent = new Map<string, string[]>()
  const issueMemberIds = new Map<string, Set<string>>()
  for (const r of issueRows ?? []) {
    const contentId = r.content_id as string
    const issueId = r.issue_id as string
    const list = issueIdsByContent.get(contentId) ?? []
    list.push(issueId)
    issueIdsByContent.set(contentId, list)
    const members = issueMemberIds.get(issueId) ?? new Set<string>()
    members.add(contentId)
    issueMemberIds.set(issueId, members)
  }

  /** 콘텐츠가 걸린 이슈들 중 "타이트한(신뢰 가능한)" 것만 걸러 대표 이슈로 쓴다. 없으면 null. */
  function pickTrustedIssueId(contentId: string): string | null {
    const issueIds = issueIdsByContent.get(contentId) ?? []
    const trusted = issueIds.filter((id) => (issueMemberIds.get(id)?.size ?? 0) <= MAX_TRUSTED_ISSUE_CLUSTER_SIZE)
    if (trusted.length === 0) {
      if (issueIds.length > 0) {
        console.warn(
          `[핵심Insight] 이슈 축소 건너뜀(과다연결, 신뢰 불가) content=${contentId} ` +
            `issues=${issueIds.map((id) => `${id}(${issueMemberIds.get(id)?.size ?? 0}건)`).join(', ')}`
        )
      }
      return null
    }
    trusted.sort((a, b) => (issueMemberIds.get(a)?.size ?? 0) - (issueMemberIds.get(b)?.size ?? 0))
    return trusted[0]
  }

  const telecomEntityIds = (telecomEntities ?? []).map((e) => e.id as string)
  const entityNameById = new Map((telecomEntities ?? []).map((e) => [e.id as string, e.canonical_name as string]))

  const { data: entityHits } = telecomEntityIds.length
    ? await admin
        .from('content_entities')
        .select('content_id, entity_id')
        .in('content_id', ids)
        .in('entity_id', telecomEntityIds)
    : { data: [] as { content_id: string; entity_id: string }[] }

  const companiesByContent = new Map<string, string[]>()
  for (const row of entityHits ?? []) {
    const name = entityNameById.get(row.entity_id)
    if (!name) continue
    const list = companiesByContent.get(row.content_id) ?? []
    list.push(name)
    companiesByContent.set(row.content_id, list)
  }

  // ── 카테고리 버킷 배정: ①자사(entity) → ④보안(matched_groups) → 나머지 키워드그룹 순 첫 매치 ──
  function assignCategory(c: (typeof scored)[number]): KeyInsightCategory | null {
    if (companiesByContent.has(c.id)) return '자사·통신사 동향'
    if ((c.matched_groups ?? []).includes(SECURITY_GROUP_NAME)) return '사이버보안'
    for (const g of c.matched_groups ?? []) {
      const mapped = GROUP_NAME_TO_CATEGORY[g]
      if (mapped) return mapped
    }
    return null
  }

  const withCategory = scored.map((c) => ({
    raw: c,
    category: assignCategory(c),
  }))

  // ── 이슈 단위 대표 1건 통합: 신뢰 가능한(타이트한) 클러스터에서만 importance_score 최고 1건만 남긴다 ──
  const byIssue = new Map<string, typeof withCategory[number]>()
  const noIssue: typeof withCategory = []
  const trustedIssueByContent = new Map<string, string | null>()
  for (const item of withCategory) {
    const issueId = pickTrustedIssueId(item.raw.id)
    trustedIssueByContent.set(item.raw.id, issueId)
    if (!issueId) {
      noIssue.push(item)
      continue
    }
    const existing = byIssue.get(issueId)
    if (!existing || (item.raw.importance_score ?? 0) > (existing.raw.importance_score ?? 0)) {
      if (existing) {
        console.warn(
          `[핵심Insight] 이슈 축소로 탈락 후보: issue=${issueId} 유지=${item.raw.id}(score=${item.raw.importance_score}) ` +
            `탈락=${existing.raw.id}(score=${existing.raw.importance_score})`
        )
      }
      byIssue.set(issueId, item)
    } else {
      console.warn(
        `[핵심Insight] 이슈 축소로 탈락 후보: issue=${issueId} 유지=${existing.raw.id}(score=${existing.raw.importance_score}) ` +
          `탈락=${item.raw.id}(score=${item.raw.importance_score})`
      )
    }
  }
  const deduped = [...byIssue.values(), ...noIssue]
  const afterIssueDedup = deduped.length

  // ── 과거기사연계 준비: issue_id 있는 후보는 창 이전(과거) 같은 이슈 콘텐츠 최신 2건 첨부 ──
  const dedupedIssueIds = [...new Set(deduped.map((d) => trustedIssueByContent.get(d.raw.id)).filter((x): x is string => !!x))]
  const pastByIssue = new Map<string, PastArticleRef[]>()
  if (dedupedIssueIds.length > 0) {
    const { data: pastLinks } = await admin
      .from('issue_contents')
      .select('issue_id, content_id')
      .in('issue_id', dedupedIssueIds)

    const pastContentIds = [...new Set((pastLinks ?? []).map((r) => r.content_id as string))]
    const { data: pastContents } = pastContentIds.length
      ? await admin
          .from('contents')
          .select('id, title, published_at, collected_at, original_url, source_id')
          .in('id', pastContentIds)
          .lt('published_at', windowStart)
          .order('published_at', { ascending: false })
      : { data: [] as { id: string; title: string; published_at: string | null; collected_at: string; original_url: string | null; source_id: string }[] }

    // content_id → issue_id 역인덱스(한 콘텐츠가 여러 이슈에 걸치는 경우는 첫 매핑만 사용).
    const issueIdByContentId = new Map<string, string>()
    for (const link of pastLinks ?? []) {
      if (!issueIdByContentId.has(link.content_id)) issueIdByContentId.set(link.content_id, link.issue_id)
    }
    // pastContents 는 published_at desc 로 이미 정렬돼 있으므로, 이 순서 그대로 순회해야
    // 이슈당 "최신 2건"이 보장된다(issue_contents 원본 순서로 순회하면 최신순이 아님).
    for (const pc of pastContents ?? []) {
      const issueId = issueIdByContentId.get(pc.id)
      if (!issueId) continue
      const list = pastByIssue.get(issueId) ?? []
      if (list.length >= 2) continue
      list.push({
        contentId: pc.id,
        title: pc.title,
        sourceName: sourceMap.get(pc.source_id) ?? '(미상)',
        publishedAt: toKstDateString(pc.published_at),
        url: pc.original_url,
      })
      pastByIssue.set(issueId, list)
    }
  }

  const candidates: KeyInsightCandidate[] = deduped.map(({ raw, category }) => {
    const issueId = trustedIssueByContent.get(raw.id) ?? null
    return {
      contentId: raw.id,
      title: raw.title,
      summaryKo: raw.summary_ko,
      sourceName: sourceMap.get(raw.source_id) ?? '(미상)',
      publishedAt: toKstDateString(raw.published_at) ?? raw.collected_at?.slice(0, 10) ?? null,
      originalUrl: raw.original_url,
      importanceScore: raw.importance_score ?? 0,
      issueId,
      suggestedCategory: category,
      companies: companiesByContent.get(raw.id) ?? [],
      pastArticles: issueId ? (pastByIssue.get(issueId) ?? []) : [],
    }
  })

  candidates.sort((a, b) => b.importanceScore - a.importanceScore)

  const byCategory: Record<string, number> = {}
  for (const c of candidates) {
    const key = c.suggestedCategory ?? '미분류'
    byCategory[key] = (byCategory[key] ?? 0) + 1
  }

  return {
    windowStart,
    candidates,
    stats: { rawCount, afterNoiseAndBlocklist, afterImportanceFilter, afterIssueDedup, byCategory },
  }
}
