import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { llmCompleteDetailed } from '@/lib/llm'
import { looseJsonParse } from '@/lib/llm/parse'
import { buildCandidatePool, KEY_INSIGHT_CATEGORIES, type KeyInsightCandidate, type KeyInsightCategory } from '@/lib/key-insights/candidates'

const MAX_PER_CATEGORY = 2
const MIN_CARDS = 8
const MAX_CARDS = 10
const URL_VERIFY_TIMEOUT_MS = 5000
// 후보 풀이 크면(수십~수백 건) 무료 LLM 티어의 TPM 한도(예: groq 8,000)를 한 번의
// 프롬프트로 넘겨버린다. 상위 N건만 프롬프트에 싣는다(호출 수는 그대로, 토큰만 증가).
// candidates.ts 의 이슈 dedup 완화(2026-07-09)로 후보 풀이 52→101건으로 커졌는데
// importance_score 가 실측상 거의 전부 동률(1)이라, 그 밑의 tie-break 정렬(아래
// comparePromptOrder)과 짝을 이뤄야 우선 카테고리 후보가 40건 밖으로 밀리지 않는다.
const MAX_CANDIDATES_IN_PROMPT = 60
// "신선도 충족(NEW)" 기준 — 7일 창 전체가 아니라 그 안에서도 가장 최근 것만 NEW로 강조.
const FRESH_DAYS = 3

// ─── KST 날짜 헬퍼 ──────────────────────────────────────────────────────────

function getKstDateParts(date: Date): { year: number; month: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date)
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    year: Number(parts.find((p) => p.type === 'year')?.value),
    month: Number(parts.find((p) => p.type === 'month')?.value),
    day: Number(parts.find((p) => p.type === 'day')?.value),
    weekday: weekdayMap[parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'],
  }
}

/** 배치 주차 시작일(가장 가까운 목요일, KST) — 'YYYY-MM-DD'. */
function getWeekOf(now: Date): string {
  const { year, month, day, weekday } = getKstDateParts(now)
  const diffFromThursday = (weekday - 4 + 7) % 7
  const d = new Date(Date.UTC(year, month - 1, day))
  d.setUTCDate(d.getUTCDate() - diffFromThursday)
  return d.toISOString().slice(0, 10)
}

/**
 * KST 기준 오늘이 목요일인지 — §3-3 cron 요일 게이트용.
 * Vercel Hobby 플랜은 요일 지정 cron 표현식이 안 먹혀 매일 도는 cron으로 등록하고,
 * 라우트 내부에서 이 게이트로 목요일에만 실제 생성이 돌게 한다(기존 getKstDateParts 재사용).
 */
export function isThursdayKst(now: Date = new Date()): boolean {
  return getKstDateParts(now).weekday === 4
}

// ─── 프롬프트 ─────────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  const categoryList = KEY_INSIGHT_CATEGORIES.map((c, i) => `${i + 1}. ${c}`).join('\n')
  return (
    '당신은 LG유플러스 전략기획을 총괄하는 시니어 애널리스트다. 독자는 LG유플러스 임직원이며, ' +
    '이 글은 사내 웹 포털의 주간 코너 "주목하세요, 핵심 Insight"다. 매주 목요일 밤, 지난 7일간 수집된 ' +
    '후보 기사 목록에서 8~10건을 골라 리치 카드로 재구성한다.\n\n' +
    '고정 카테고리 7개(반드시 이 중 하나만 사용, 다른 이름 창작 금지):\n' + categoryList + '\n\n' +
    '반드시 지켜야 할 규칙:\n' +
    '1. 후보 목록에 나열된 content_id만 사용한다. 목록에 없는 id·URL·매체·발행일·헤드라인을 지어내지 않는다 ' +
    '(헤드라인·매체·발행일·URL은 우리 쪽에서 content_id로 채우니, 너는 selection과 요약·시사점 문장만 작성하면 된다).\n' +
    '2. 각 후보에는 "1차 힌트 카테고리"가 참고로 붙어있다(키워드 매칭 기반이라 부정확할 수 있음) — ' +
    '실제 기사 내용 기준으로 7개 카테고리 중 가장 맞는 것을 네가 다시 판단해라. 7개 중 어디에도 맞지 않으면 그 후보는 선정하지 마라.\n' +
    '3. 카테고리당 최대 2건. 후보에 "언급 회사" 필드가 있으면 그 회사명으로 자사(LG유플러스)인지 ' +
    '경쟁사(SKT/KT/SK브로드밴드)인지 판단해라.\n' +
    '4. 우선 카테고리 최소 확보(칸 채우기가 아니라 "적격 후보가 있으면 반드시 편입"이다):\n' +
    '   - 자사·통신사 동향, 사이버보안: 적격 후보가 있으면 각 최소 1건, 가능하면 2건 반드시 편입.\n' +
    '   - AIDC·클라우드: 적격 후보가 있으면 최소 1건 — 국내·자사 연관 구축/투자/수주를 범용 시황보다 우선.\n' +
    '5. 배제 대상(적격 후보가 없다고 해서 아래 유형으로 칸을 채우지 마라): 벤더 제품 출시·기능 소개 블로그' +
    '(단, 통신·B2B 시장 판도에 실질적 시사점이 있으면 예외), 범용 시황·전망 오피니언, 행사·실험·수상·인사성 소식, 순수 소비자 AI 앱.\n' +
    '6. 적격(우선) 기준: 자사·경쟁사 통신사의 실제 사업 움직임(수주·제휴·투자·M&A·조직개편), ' +
    '국내 AIDC/클라우드 구축·투자·수주, 국내 보안 사고·규제·수주, 정부의 AI·데이터센터·통신 B2B 정책.\n' +
    '7. 충돌 처리: 우선 카테고리라도 후보가 전부 5번 배제 대상급으로 약하면 억지로 넣지 말고 그 카테고리는 비워라 ' +
    '(카드가 8건 미만이 되어도 좋다). 품질이 칸 채우기보다 우선이다.\n' +
    '8. 같은 사안을 다루는 후보가 여럿이면(이미 대표 1건으로 정리돼 있지만 만약 겹쳐 보이면) 가장 근거가 확실한 1건만 선택한다.\n' +
    '9. 해외 기사보다 국내 소식을 우선하되, 글로벌 빅테크·One LG 카테고리처럼 성격상 해외 소식이 자연스러운 경우는 예외.\n' +
    '10. 각 카드는 다음을 작성한다:\n' +
    '   - summary_ko: 핵심요약 정확히 2문장, 한국어.\n' +
    '   - implication: LG유플러스 관점 시사점 1~2문장 — 이 소식이 당사에 기회/위협인지, 무엇을 준비해야 하는지. ' +
    '"LG유플러스는"/"LGU+는"/"LG유플러스 관점에서" 같은 도입 문구로 시작하지 말고 시사점 본문으로 바로 시작해라(카드 UI에 이미 💡 표시가 붙는다).\n' +
    '   - related_past: 후보에 "참고용 과거기사"가 딸려 있으면, 그중 진짜 관련 있는 것만 최대 2건 골라 ' +
    '{content_id, reason}으로 적는다. reason은 "왜 함께 보면 좋은지" 1문장. 관계가 억지스러우면 아예 넣지 마라(빈 배열 허용).\n' +
    '11. 입력에 없는 사실·수치·인용을 창작하지 않는다.\n' +
    '12. JSON만 출력한다. 코드펜스·설명 문장 금지.\n\n' +
    '출력 스키마:\n' +
    '{"cards":[{"content_id":"<입력 id>","category":"<7개 중 하나>","summary_ko":"...","implication":"...",' +
    '"related_past":[{"content_id":"<그 후보의 과거기사 id>","reason":"..."}]}]}'
  )
}

function buildUserPrompt(candidates: KeyInsightCandidate[]): string {
  const lines = candidates.map((c) => {
    const summary = (c.summaryKo ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
    const past = c.pastArticles.length
      ? '\n참고용 과거기사: ' + c.pastArticles.map((p) => `[id=${p.contentId}] ${p.title} (${p.publishedAt ?? '날짜미상'})`).join(' / ')
      : ''
    // 자사(LG유플러스) vs 경쟁사(SKT/KT/SK브로드밴드) 구분 — 프롬프트가 "자사 우선편입"을
    // 지시하므로, 어느 회사가 언급됐는지 실제로 알려줘야 LLM이 그 판단을 할 수 있다.
    const companyLine = c.companies.length ? `\n언급 회사: ${c.companies.join(', ')}` : ''
    return (
      `id=${c.contentId}\n1차 힌트 카테고리: ${c.suggestedCategory ?? '(없음)'}\n` +
      `제목: ${c.title}\n매체: ${c.sourceName} / 발행일: ${c.publishedAt ?? '미상'}` +
      companyLine + (summary ? `\n요약: ${summary}` : '') + past
    )
  })
  return `후보 ${candidates.length}건 (중요도순):\n\n${lines.join('\n\n')}`
}

// ─── 파싱·환각 가드 ───────────────────────────────────────────────────────────

interface RawCard {
  content_id: string
  category: string
  summary_ko: string
  implication: string
  related_past: { content_id: string; reason: string }[]
}

function parseCards(raw: string): RawCard[] {
  const parsed = looseJsonParse(raw)
  if (!parsed || typeof parsed !== 'object') return []
  const list = (parsed as Record<string, unknown>).cards
  if (!Array.isArray(list)) return []

  const out: RawCard[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const h = item as Record<string, unknown>
    const contentId = typeof h.content_id === 'string' ? h.content_id.trim() : ''
    const category = typeof h.category === 'string' ? h.category.trim() : ''
    const summaryKo = typeof h.summary_ko === 'string' ? h.summary_ko.trim() : ''
    const implication = typeof h.implication === 'string' ? h.implication.trim() : ''
    const relatedRaw = Array.isArray(h.related_past) ? h.related_past : []
    const relatedPast = relatedRaw
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
      .map((r) => ({
        content_id: typeof r.content_id === 'string' ? r.content_id.trim() : '',
        reason: typeof r.reason === 'string' ? r.reason.trim().slice(0, 200) : '',
      }))
      .filter((r) => r.content_id && r.reason)

    if (!contentId || !category || !summaryKo) continue
    out.push({ content_id: contentId, category, summary_ko: summaryKo, implication, related_past: relatedPast })
  }
  return out
}

export interface SavedKeyInsightCard {
  contentId: string
  category: KeyInsightCategory
  headline: string
  summaryKo: string
  implication: string
  sourceName: string
  publishedAt: string | null
  sourceUrl: string | null
  isNew: boolean
  needsVerify: boolean
  issueId: string | null
  relatedPast: { content_id: string; title: string; url: string | null; source: string; published_at: string | null; reason: string }[]
}

/** 환각 가드 — content_id 는 후보 맵에 있는 것만, 카테고리는 고정 7개만, 카테고리당 상한 적용. */
function validateAndBuildCards(
  rawCards: RawCard[],
  candidateMap: Map<string, KeyInsightCandidate>
): SavedKeyInsightCard[] {
  const validCategories = new Set<string>(KEY_INSIGHT_CATEGORIES)
  const perCategoryCount = new Map<string, number>()
  const seenContentIds = new Set<string>()
  const results: SavedKeyInsightCard[] = []

  for (const raw of rawCards) {
    if (results.length >= MAX_CARDS) break

    const candidate = candidateMap.get(raw.content_id)
    if (!candidate) continue // 환각 가드: 후보 목록 밖 id 제거
    if (seenContentIds.has(raw.content_id)) continue
    if (!validCategories.has(raw.category)) continue // 무관 카테고리 drop

    const count = perCategoryCount.get(raw.category) ?? 0
    if (count >= MAX_PER_CATEGORY) continue

    const pastById = new Map(candidate.pastArticles.map((p) => [p.contentId, p]))
    const relatedPast = raw.related_past
      .map((r) => {
        const past = pastById.get(r.content_id)
        if (!past) return null // 환각 가드: 그 후보의 실제 과거기사 목록 밖이면 폐기
        return {
          content_id: past.contentId,
          title: past.title,
          url: past.url,
          source: past.sourceName,
          published_at: past.publishedAt,
          reason: r.reason,
        }
      })
      .filter((r): r is NonNullable<typeof r> => !!r)
      .slice(0, 2)

    seenContentIds.add(raw.content_id)
    perCategoryCount.set(raw.category, count + 1)

    results.push({
      contentId: candidate.contentId,
      category: raw.category as KeyInsightCategory,
      headline: candidate.title, // 헤드라인은 후보 실제값만 — LLM 출력 사용 안 함
      summaryKo: raw.summary_ko,
      implication: raw.implication,
      sourceName: candidate.sourceName,
      publishedAt: candidate.publishedAt,
      sourceUrl: candidate.originalUrl,
      isNew: isFresh(candidate.publishedAt),
      needsVerify: true, // verifyUrls() 에서 실제 검증 후 갱신
      issueId: candidate.issueId,
      relatedPast,
    })
  }

  return results
}

function isFresh(publishedAt: string | null): boolean {
  if (!publishedAt) return false
  const publishedMs = new Date(publishedAt).getTime()
  if (Number.isNaN(publishedMs)) return false
  return Date.now() - publishedMs <= FRESH_DAYS * 24 * 3600 * 1000
}

// ─── 원문 URL 검증(§3 출처 검증) ──────────────────────────────────────────────

async function urlOpens(url: string): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), URL_VERIFY_TIMEOUT_MS)
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal })
    return res.ok || (res.status >= 300 && res.status < 400)
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function verifyUrls(cards: SavedKeyInsightCard[]): Promise<void> {
  await Promise.all(
    cards.map(async (card) => {
      if (!card.sourceUrl) {
        card.needsVerify = true
        return
      }
      card.needsVerify = !(await urlOpens(card.sourceUrl))
    })
  )
}

// ─── 프롬프트 후보 정렬(tie-break) ────────────────────────────────────────────
// importance_score 동률(실측상 대다수 1)일 때 정렬이 DB 반환 순서(사실상 무작위)에
// 의존해, 우선 카테고리 후보가 컷 밖으로 밀리는 사고가 반복됐다(2026-07-09 배치:
// 랜섬웨어·강원 AI DC 실사례). candidates.ts 가 이미 후보 단계에서 판정해둔
// suggestedCategory(자사 entity 매칭·사이버보안/AIDC matched_groups)를 재사용해
// "값싼" 우선순위 신호로 쓴다 — 완벽한 분류가 아니어도 된다, 나머지 정밀도는
// LLM 선정 프롬프트(§5) + 사람 검수가 잡는다.
// 2026-07-09 개정: AIDC·클라우드를 Tier2 로 추가(자사·보안보다는 아래, 나머지보다는 위).
const PRIORITY_TIER1_CATEGORIES: ReadonlySet<KeyInsightCategory> = new Set(['자사·통신사 동향', '사이버보안'])
const PRIORITY_TIER2_CATEGORIES: ReadonlySet<KeyInsightCategory> = new Set(['AIDC·클라우드'])

/** 정렬 가중치 — Tier1(자사·통신사/사이버보안)=2, Tier2(AIDC·클라우드)=1, 그 외=0. */
function priorityFlag(c: KeyInsightCandidate): number {
  if (c.suggestedCategory !== null && PRIORITY_TIER1_CATEGORIES.has(c.suggestedCategory)) return 2
  if (c.suggestedCategory !== null && PRIORITY_TIER2_CATEGORIES.has(c.suggestedCategory)) return 1
  return 0
}

/**
 * 프롬프트 투입 순서 정렬 — importance ↓ → priority_flag ↓ → published_at ↓ → content_id ↑.
 * 마지막 content_id 키는 앞의 신호가 전부 동률일 때도 실행마다 순서가 바뀌지 않도록
 * (재현성) 넣은 결정론적 tie-breaker다.
 */
function comparePromptOrder(a: KeyInsightCandidate, b: KeyInsightCandidate): number {
  if (b.importanceScore !== a.importanceScore) return b.importanceScore - a.importanceScore

  const priorityDiff = priorityFlag(b) - priorityFlag(a)
  if (priorityDiff !== 0) return priorityDiff

  const aPublished = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
  const bPublished = b.publishedAt ? new Date(b.publishedAt).getTime() : 0
  if (bPublished !== aPublished) return bPublished - aPublished

  if (a.contentId < b.contentId) return -1
  if (a.contentId > b.contentId) return 1
  return 0
}

// ─── 메인 함수 ────────────────────────────────────────────────────────────────

export interface GenerateKeyInsightResult {
  ok: boolean
  reason?: string
  /** true 면 실패가 아니라 멱등/요일 게이트에 의한 정상 스킵(§3-3) — cron 응답 요약에 사용. */
  skipped?: boolean
  /** LLM 전량 실패 시 마지막 provider 실패 원인(재시도 후에도 실패한 사유, §3). */
  errorReason?: string | null
  weekOf?: string
  savedCount?: number
  cards?: SavedKeyInsightCard[]
  poolStats?: Awaited<ReturnType<typeof buildCandidatePool>>['stats']
}

export async function generateKeyInsightBatch(opts?: { force?: boolean }): Promise<GenerateKeyInsightResult> {
  const admin = createAdminClient()
  const weekOf = getWeekOf(new Date())

  // 멱등 가드 — 이미 이번 주차 배치가 있으면 force 없인 재생성 안 함.
  // 검수·게시(published)까지 끝난 배치는 force 로도 절대 덮어쓰지 않는다(모닝브리핑과 동일 방침).
  const { data: existing } = await admin
    .from('key_insights')
    .select('id, status')
    .eq('week_of', weekOf)

  const hasPublished = (existing ?? []).some((r) => r.status === 'published')
  if (hasPublished) {
    return { ok: false, skipped: true, reason: '이번 주차 배치가 이미 게시됨', weekOf }
  }
  if (existing && existing.length > 0 && !opts?.force) {
    return { ok: false, skipped: true, reason: '이번 주차 배치가 이미 존재함(force 필요)', weekOf }
  }
  if (existing && existing.length > 0 && opts?.force) {
    // force 재생성 — 중복 삽입 대신 기존(미게시) 배치를 지우고 새로 채운다.
    const { error: deleteError } = await admin.from('key_insights').delete().eq('week_of', weekOf)
    if (deleteError) {
      return { ok: false, reason: `기존 배치 삭제 실패: ${deleteError.message}`, weekOf }
    }
  }

  const pool = await buildCandidatePool()
  if (pool.candidates.length === 0) {
    return { ok: false, reason: '후보 없음(프리필터 통과분 0건)', weekOf, poolStats: pool.stats }
  }

  // importance_score 동률이 대다수라 buildCandidatePool 의 단일 키 정렬만으론 부족 —
  // 다신호 tie-break(comparePromptOrder)로 재정렬 후 상위 N건만 프롬프트에 태운다.
  const promptCandidates = [...pool.candidates].sort(comparePromptOrder).slice(0, MAX_CANDIDATES_IN_PROMPT)
  const candidateMap = new Map(promptCandidates.map((c) => [c.contentId, c]))

  const system = buildSystemPrompt()
  const user = buildUserPrompt(promptCandidates)
  // llmCompleteDetailed = llmComplete 와 동일한 재시도(completeWithRetry)·라우팅 경로를 타되,
  // 전량 실패 시 마지막 provider 실패 사유까지 받아 배치 단위로 영속화(§3, 모닝브리핑 실패이력 반영).
  const { text: raw, errorReason: llmErrorReason } = await llmCompleteDetailed('key_insight', system, user)
  if (!raw) {
    const failedAt = new Date().toISOString()
    console.error(`[핵심Insight] ${failedAt} weekOf=${weekOf} LLM 전량 실패: ${llmErrorReason ?? '사유 미상'}`)
    return {
      ok: false,
      reason: `LLM 응답 없음${llmErrorReason ? `(${llmErrorReason})` : ''}`,
      errorReason: llmErrorReason,
      weekOf,
      poolStats: pool.stats,
    }
  }

  const rawCards = parseCards(raw)
  const cards = validateAndBuildCards(rawCards, candidateMap)

  if (cards.length === 0) {
    console.error(`[핵심Insight] ${new Date().toISOString()} weekOf=${weekOf} LLM 출력 검증 후 남은 카드 0건(환각 가드에 전량 걸림)`)
    return { ok: false, reason: 'LLM 출력 검증 후 남은 카드 0건', weekOf, poolStats: pool.stats }
  }
  if (cards.length < MIN_CARDS) {
    console.warn(`[핵심Insight] 목표 ${MIN_CARDS}건 미달 — ${cards.length}건으로 진행(부분 저장)`)
  }

  await verifyUrls(cards)

  const rows = cards.map((card, idx) => ({
    week_of: weekOf,
    status: 'needs_review',
    display_order: idx + 1,
    is_featured: false,
    category: card.category,
    headline: card.headline,
    summary_ko: card.summaryKo,
    implication: card.implication || null,
    source_name: card.sourceName,
    published_at: card.publishedAt,
    source_url: card.sourceUrl,
    is_new: card.isNew,
    needs_verify: card.needsVerify,
    issue_id: card.issueId,
    related_past: card.relatedPast.length > 0 ? card.relatedPast : null,
  }))

  const { error: insertError } = await admin.from('key_insights').insert(rows)
  if (insertError) {
    console.error(`[핵심Insight] ${new Date().toISOString()} weekOf=${weekOf} DB 저장 실패: ${insertError.message}`)
    return { ok: false, reason: `DB 저장 실패: ${insertError.message}`, weekOf, poolStats: pool.stats }
  }

  return { ok: true, weekOf, savedCount: rows.length, cards, poolStats: pool.stats }
}
