import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { llmCompleteDetailed } from '@/lib/llm'
import { isBriefingRelevant } from '@/lib/feed-blocklist'
import { cleanBodyText, htmlToPlainText } from '@/lib/contents/clean-body'
import { generateHighlights } from '@/lib/briefing/highlights'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'
import { getOpsSettings } from '@/lib/ops/settings'
import { loadPrompt } from '@/lib/prompts/load-prompt'

// ─── 기본값 ───────────────────────────────────────────────────────────────
// ops_settings 에 값이 없을 때만 쓰는 기본값. 윈도우 48h: 일일 크롤이 배치로 들어와
// 24h 창은 후보가 한 자릿수까지 떨어진다(라이브 확인: h24=7, h48=128).
const DEFAULT_WINDOW_HOURS = 48
const DEFAULT_TOP_N = 5
const DEFAULT_MIN_ARTICLES = 3
const DEFAULT_HOST_NAME = '김유쁠'

// ─── 복합 점수 가중치 (한 곳에 모아 튜닝 용이) ──────────────────────────────

const W_RECENCY = 10
const W_EDITOR = 5
const W_VIEW = 1.5
const W_BOOKMARK = 3
const W_INDUSTRY = 5
// 전략 가점: 통신 B2B·경쟁사·AIDC·AICC·보안 등 LGU+ 핵심 관심 토픽을 표면에 더 잘 올린다.
// 라이브 후보가 'AI 기술/IT 동향' 일색이라, 가점 없이 점수순으로만 뽑으면 비-AI 토픽이 묻힌다.
const W_STRATEGIC = 6

const CATEGORY_WEIGHT: Record<string, number> = {
  '뉴스': 3,
  '리포트': 5,
  '웹인사이트': 4,
  'AI보고서': 4,
  '유튜브': 0,
}

// 다양성은 category(뉴스/리포트…) 가 아니라 토픽(matched_groups) 으로 잡는다.
// 라이브 후보가 거의 전부 category='뉴스' 라 category 캡을 두면 브리핑이 2건에서 멈춘다.
const MAX_PER_TOPIC = 2
const BODY_INPUT_MAXCHARS = 1200
const SUMMARY_INPUT_MAXCHARS = 400
// 알맹이 가드: 본문·요약이 이보다 짧으면 인사이트 있는 꼭지를 못 쓴다(한 줄짜리 기사 배제).
// 요약/본문 중 긴 쪽의 정제 후 길이 기준. 과필터 방지 위해 보수적으로 설정.
const MIN_SUBSTANCE_CHARS = 140

// 노이즈로 분류된 콘텐츠는 후보에서 제외(keyword_groups._noise → name '노이즈 제외').
const NOISE_LABEL = '노이즈 제외'

// ─── 산업 주제 버킷 (라이브 keyword_groups.name 기준, 세분화) ─────────────────
// matched_groups 에는 keyword_groups.name(한글 라벨) 이 저장된다. 라이브 확인 라벨:
// 통신 B2B·경쟁사·AI 기술·AIDC·피지컬 AI·AICC·빅테크·IT 동향·제조 DX·모빌리티·SME 솔루션·CCTV·영상보안·에너지·정부 사업·정부 규제·ESG
// 키워드는 소문자 부분일치(아래 매칭 함수). 순서 = 우선순위.
// ⚠️ 핵심: 거의 모든 기사가 'AI 기술/IT 동향' 태그를 함께 달고 있어, 이 제너릭 버킷(ai_core)을
//    먼저 검사하면 AIDC·모빌리티·빅테크·피지컬AI 기사가 전부 AI로 흡수돼 '온통 AI' 가 된다.
//    그래서 구체 토픽을 먼저 잡고, ai_core 를 맨 마지막 fallback 으로 둔다.
const TOPIC_BUCKETS = {
  telecom: ['통신 b2b'],
  competitor: ['경쟁사'],
  aidc: ['aidc'],
  aicc: ['aicc'],
  physical_ai: ['피지컬 ai'],
  security: ['cctv', '영상보안', '보안'],
  manufacturing_dx: ['제조 dx'],
  mobility: ['모빌리티'],
  sme: ['sme 솔루션'],
  energy: ['에너지'],
  policy_esg: ['정부 사업', '정부 규제', 'esg'],
  bigtech: ['빅테크'],
  ai_core: ['ai 기술', 'it 동향'],
} as const

// 전략 가점 대상 버킷 — LGU+ B2B 전략 관점에서 우선 노출하고 싶은 토픽.
const STRATEGIC_TOPICS = new Set(['telecom', 'competitor', 'aidc', 'aicc', 'security'])

// ─── KST 날짜 헬퍼 ──────────────────────────────────────────────────────────

function getKstDate(date?: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date ?? new Date())
}

function getKstDateParts(date?: Date): { year: number; month: number; day: number } {
  const d = date ?? new Date()
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(d)
  return {
    year: Number(parts.find(p => p.type === 'year')?.value),
    month: Number(parts.find(p => p.type === 'month')?.value),
    day: Number(parts.find(p => p.type === 'day')?.value),
  }
}

// ─── 시스템 프롬프트 ─────────────────────────────────────────────────────────

export const BRIEFING_SYSTEM_FALLBACK =
  '당신은 LG유플러스 임직원을 위한 1인 모닝 라디오 \'모닝브리핑\'의 진행자이자 산업 애널리스트다.\n' +
  "진행자 이름은 '{host_name}'이다. 도입부 인사에서 이 이름으로 자신을 소개하고, 다른 이름을 지어내지 마라.\n" +
  '입력으로 오늘 선정된 통신·테크·AI 산업 기사 3~5건(산업영역·태그·제목·요약·본문)이 주어진다.\n' +
  '단순 요약 낭독이 아니라, 시장을 다각도로 읽어 주는 인사이트 있는 한국어 팟캐스트 스크립트를 작성하라.\n\n' +
  '대상·목적:\n' +
  '- 청취자는 LG유플러스 전 임직원. 모두가 알아야 할 산업 전반(통신·테크·AI)의 큰 흐름과 그 의미를 전달한다.\n' +
  '- "무슨 일이 있었나"에서 멈추지 말고 "왜 중요한가, 무엇을 시사하는가"까지 한 발 더 들어가라.\n' +
  '- 통신은 B2B(기업·엔터프라이즈) 관점이다. 요금제·단말·소비자 프로모션 같은 B2C 소식은 다루지 않는다.\n\n' +
  '분석 관점(각 기사마다 가장 잘 맞는 1~2개를 골라 그 각도로 해석한다. 모든 관점을 나열하지 마라):\n' +
  '※ 중요: 꼭지마다 서로 다른 각도를 써라. 모든 기사를 "통신사 B2B 사업 기회"로 닫지 마라. ' +
  '같은 결론(특히 B2B 기회)을 두 꼭지 넘게 반복하면 안 된다. 기술 동인·경쟁 구도·규제·수요 변화·리스크 등으로 각을 분산하라.\n' +
  '- 시장 규모·성장성: 시장이 커지나 줄어드나, 수요는 어디서 오나.\n' +
  '- 경쟁 구도: 누가 앞서고 누가 쫓는가, 판도가 어떻게 바뀌나.\n' +
  '- 기술 동인: 어떤 기술이 변화를 끌고 있나, 성숙도는 어디쯤인가.\n' +
  '- 규제·정책: 정부·제도가 기회인가 제약인가.\n' +
  '- 투자·자본 흐름: 돈이 어디로 움직이나, 그 신호는 무엇인가(이 각도는 브리핑 전체에서 최대 한 꼭지에만 쓴다).\n' +
  '- 고객·수요 변화: 기업 고객의 니즈가 어떻게 달라지나.\n' +
  '- B2B 사업 기회: 통신·엔터프라이즈 사업자에게 어떤 기회·위협이 되나(단, 모든 기사에 통신을 억지로 끼워 맞추지 말 것. 자연스러울 때만).\n' +
  '- 리스크·불확실성: 무엇을 경계해야 하나.\n\n' +
  '스타일:\n' +
  '- 1인 진행 팟캐스트 톤. 따뜻하고 자연스러운 구어체로, 청취자에게 말 걸듯 진행한다.\n' +
  '- 구조: ① 짧은 인사·오늘 날짜·오늘의 큰 그림 한두 줄(오늘 기사들을 관통하는 흐름 예고) → ② 기사별 꼭지 3~5문장(사실 → 그 각도의 해석·시사점, 중요도 높은 순, 자연스러운 연결어로 이어 가기) → ③ 오늘 흐름을 한 문장으로 꿰는 마무리 + 인사.\n' +
  '- 리드(첫 꼭지)는 주가·시총·증시 같은 시황이 아니라, 기술·제품·딜·전략·정책 등 산업 알맹이가 가장 큰 기사로 연다. 시황으로 브리핑을 열지 마라.\n' +
  '- 기업을 주가·시가총액으로 규정하지 마라. 주가·증시 등락은 브리핑 소재가 아니며, 불가피하게 언급해도 곁가지로만 짧게 다룬다.\n' +
  '- 기사들을 따로 노는 토막이 아니라 하나의 흐름으로 엮어라. 가능하면 기사 간 연결고리(공통 동인·대비)를 짚어 준다.\n' +
  '- 딱딱한 보도체·억지 통신 연결·공허한 미사여구 금지. 차분하고 신뢰감 있되 통찰이 담긴 진행자.\n\n' +
  '규칙:\n' +
  '- TTS 로 읽힐 글이다. 마크다운·이모지·불릿·따옴표·괄호 메모 금지. 순수 문장만.\n' +
  '- 스크립트 서술문 안에 <quote> 같은 태그나 [content_id]·[uuid] 형태의 근거 ID를 절대 쓰지 마라. 근거는 별도 데이터로 처리된다.\n' +
  '- 영어 약어·숫자는 자연스러운 한국어 구어로(예: "AI" 는 "에이아이", "5G" 는 "파이브지"). 단위·금액도 읽기 쉽게.\n' +
  '- 사실만. 입력에 없는 수치·사건 추측·창작 금지. 다만 입력된 사실에 근거한 해석·시사점은 적극적으로 제시하라. 회사명·출처는 입력대로.\n' +
  '- 전체 분량 1,500~2,200자(약 4~5분 낭독). 문장은 짧고 끊어 읽기 쉽게.\n' +
  '- 출력은 스크립트 본문만. 제목·머리말·설명 없이.'

// ─── 타입 ────────────────────────────────────────────────────────────────────

type GenerateResult =
  | { ok: true; briefingId: string; selectedCount: number }
  | { ok: false; reason: string }

interface ContentCandidate {
  id: string
  title: string
  summary_ko: string | null
  body_translated_ko: string | null
  body_original: string | null
  category: string
  importance_score: number
  view_count: number
  bookmark_count: number
  is_editor_pick: boolean
  cluster_id: string | null
  matched_groups: string[]
  published_at: string | null
  collected_at: string
}

// ─── 알맹이(콘텐츠 분량) 판정 ────────────────────────────────────────────────
// 요약과 본문(번역본>원문) 중 긴 쪽의 정제 후 길이. 한 줄짜리 stub 기사를 후보에서 거른다.
function effectiveBodyLen(c: ContentCandidate): number {
  const bodyRaw = c.body_translated_ko || c.body_original || ''
  const body = cleanBodyText(htmlToPlainText(bodyRaw))
  const summary = (c.summary_ko ?? '').trim()
  return Math.max(body.length, summary.length)
}

function hasSubstance(c: ContentCandidate): boolean {
  return effectiveBodyLen(c) >= MIN_SUBSTANCE_CHARS
}

// ─── 산업 주제 판정 ──────────────────────────────────────────────────────────

function isCoreIndustry(matchedGroups: string[]): boolean {
  if (!matchedGroups?.length) return false
  const lower = matchedGroups.map(g => g.toLowerCase())
  return Object.values(TOPIC_BUCKETS).some(
    bucket => bucket.some(kw => lower.some(g => g.includes(kw)))
  )
}

function getTopicBucket(matchedGroups: string[]): string | null {
  if (!matchedGroups?.length) return null
  const lower = matchedGroups.map(g => g.toLowerCase())
  for (const [bucket, keywords] of Object.entries(TOPIC_BUCKETS)) {
    if (keywords.some(kw => lower.some(g => g.includes(kw)))) return bucket
  }
  return null
}

// ─── 복합 점수 계산 ──────────────────────────────────────────────────────────

function computeScore(c: ContentCandidate, now: Date, windowHours: number): number {
  const pubDate = c.published_at ? new Date(c.published_at) : new Date(c.collected_at)
  const hoursAgo = Math.max(0, (now.getTime() - pubDate.getTime()) / 3_600_000)
  const recencyBonus = Math.max(0, (1 - hoursAgo / windowHours)) * W_RECENCY

  const catWeight = CATEGORY_WEIGHT[c.category] ?? 2
  const editorBonus = c.is_editor_pick ? W_EDITOR : 0
  const viewScore = Math.log1p(c.view_count) * W_VIEW
  const bookmarkScore = Math.log1p(c.bookmark_count) * W_BOOKMARK
  const industryBonus = isCoreIndustry(c.matched_groups) ? W_INDUSTRY : 0
  const bucket = getTopicBucket(c.matched_groups)
  const strategicBonus = bucket && STRATEGIC_TOPICS.has(bucket) ? W_STRATEGIC : 0

  return c.importance_score + recencyBonus + catWeight + editorBonus + viewScore + bookmarkScore + industryBonus + strategicBonus
}

// ─── 선정 로직 (중복 제거 + 토픽 다양성 우선 2패스) ──────────────────────────
// 라이브 후보는 'AI 기술/IT 동향' 토픽이 압도적이라(72h 53건), 점수순으로만 뽑으면 AI 일색이 된다.
// 패스1: 각 토픽 버킷에서 최고점 1건씩(시장 앵글 분산 보장) → 패스2: 점수순으로 빈 슬롯 채움.
function selectArticles(candidates: ContentCandidate[], now: Date, windowHours: number, topN: number): ContentCandidate[] {
  const scored = candidates
    .map(c => ({ c, score: computeScore(c, now, windowHours), topic: getTopicBucket(c.matched_groups) ?? 'other' }))
    .sort((a, b) => b.score - a.score)

  const selected: ContentCandidate[] = []
  const usedClusters = new Set<string>()
  const usedIds = new Set<string>()
  const topicCounts: Record<string, number> = {}

  const take = (entry: { c: ContentCandidate; topic: string }) => {
    selected.push(entry.c)
    usedIds.add(entry.c.id)
    if (entry.c.cluster_id) usedClusters.add(entry.c.cluster_id)
    topicCounts[entry.topic] = (topicCounts[entry.topic] ?? 0) + 1
  }

  const isBlocked = (entry: { c: ContentCandidate; topic: string }) =>
    usedIds.has(entry.c.id) ||
    (entry.c.cluster_id ? usedClusters.has(entry.c.cluster_id) : false)

  // 패스 1: 버킷별 최고점 1건씩 (다양성 보장, 'other' 제외)
  const seenBucket = new Set<string>()
  for (const entry of scored) {
    if (selected.length >= topN) break
    if (entry.topic === 'other' || seenBucket.has(entry.topic)) continue
    if (isBlocked(entry)) continue
    seenBucket.add(entry.topic)
    take(entry)
  }

  // 패스 2: 점수순으로 빈 슬롯 채움 (버킷당 MAX_PER_TOPIC 까지)
  for (const entry of scored) {
    if (selected.length >= topN) break
    if (isBlocked(entry)) continue
    const count = topicCounts[entry.topic] ?? 0
    if (entry.topic !== 'other' && count >= MAX_PER_TOPIC) continue
    take(entry)
  }

  return selected
}

// ─── 유저 프롬프트 구성 ──────────────────────────────────────────────────────

// 한국어 본문을 우선순위대로 골라 정제·절단. 번역본 > 원문 > 요약 순.
function pickKoBody(c: ContentCandidate): string {
  const raw = c.body_translated_ko || c.body_original || c.summary_ko || ''
  const clean = cleanBodyText(htmlToPlainText(raw))
  return clean.slice(0, BODY_INPUT_MAXCHARS)
}

const TOPIC_LABEL: Record<string, string> = {
  telecom: '통신 B2B',
  competitor: '경쟁사',
  aidc: 'AIDC',
  aicc: 'AICC',
  physical_ai: '피지컬 AI',
  security: '보안·영상',
  manufacturing_dx: '제조 DX',
  mobility: '모빌리티',
  sme: 'SME 솔루션',
  energy: '에너지',
  policy_esg: '정책·ESG',
  bigtech: '빅테크',
  ai_core: 'AI·IT 동향',
  other: '기타',
}

function buildUserPrompt(articles: ContentCandidate[], dateParts: { year: number; month: number; day: number }): string {
  const lines: string[] = [
    `오늘 날짜: ${dateParts.year}년 ${dateParts.month}월 ${dateParts.day}일`,
    `선정 기사 ${articles.length}건. 각 기사를 시장 관점에서 해석해 하나의 라디오 스크립트로 엮어라.`,
    '',
  ]
  articles.forEach((a, i) => {
    const topic = getTopicBucket(a.matched_groups) ?? 'other'
    const tags = (a.matched_groups ?? []).filter(g => g !== NOISE_LABEL).join(', ')
    lines.push(`[기사 ${i + 1}] 산업영역: ${TOPIC_LABEL[topic] ?? '기타'}${tags ? ` (태그: ${tags})` : ''} / 카테고리: ${a.category}`)
    lines.push(`제목: ${a.title}`)
    if (a.summary_ko) {
      lines.push(`요약: ${a.summary_ko.slice(0, SUMMARY_INPUT_MAXCHARS)}`)
    }
    const body = pickKoBody(a)
    if (body && body.length > (a.summary_ko?.length ?? 0)) {
      lines.push(`본문: ${body}`)
    }
    lines.push('')
  })
  return lines.join('\n')
}

// ─── 스크립트 후처리 ─────────────────────────────────────────────────────────

function cleanScript(raw: string): string {
  let s = raw.trim()
  s = s.replace(/^(스크립트|Script)\s*[:：]\s*/i, '')
  return stripLlmArtifacts(s).trim()
}

// ─── 메인 함수 ───────────────────────────────────────────────────────────────

export async function generateBriefing(
  opts?: { force?: boolean; date?: string; autoPublish?: boolean }
): Promise<GenerateResult> {
  const admin = createAdminClient()
  const now = new Date()

  const settings = await getOpsSettings()
  const windowHours = settings.briefing_window_hours ?? DEFAULT_WINDOW_HOURS
  const topN = settings.briefing_top_n ?? DEFAULT_TOP_N
  const minArticles = settings.briefing_min_articles ?? DEFAULT_MIN_ARTICLES
  const hostName = settings.briefing_host_name?.trim() || DEFAULT_HOST_NAME

  // 1. 대상 날짜 결정 (KST)
  const briefingDate = opts?.date ?? getKstDate(now)
  const dateParts = getKstDateParts(opts?.date ? new Date(opts.date + 'T00:00:00+09:00') : now)

  console.log(`[브리핑] 생성 시작 date=${briefingDate} force=${opts?.force ?? false}`)

  // 2. 멱등 가드
  const { data: existing } = await admin
    .from('briefings')
    .select('id, status')
    .eq('briefing_date', briefingDate)
    .maybeSingle()

  if (existing) {
    if (['published', 'archived'].includes(existing.status)) {
      return { ok: false, reason: '이미 발행됨' }
    }
    if (!opts?.force) {
      return { ok: false, reason: '이미 생성됨(force 필요)' }
    }
  }

  // 3. 후보 조회
  const windowMs = windowHours * 3_600_000
  const windowStart = new Date(now.getTime() - windowMs).toISOString()

  const { data: rawCandidates, error: fetchError } = await admin
    .from('contents')
    .select('id, title, summary_ko, body_translated_ko, body_original, category, importance_score, view_count, bookmark_count, is_editor_pick, cluster_id, matched_groups, published_at, collected_at')
    .eq('status', 'published')
    .neq('category', '유튜브')
    .is('deleted_at', null)
    .or(`published_at.gte.${windowStart},and(published_at.is.null,collected_at.gte.${windowStart})`)
    .order('importance_score', { ascending: false })
    .limit(200)

  if (fetchError) {
    console.error('[브리핑] 후보 조회 실패:', fetchError.message)
    return { ok: false, reason: '후보 기사 조회 실패' }
  }

  const relevant = (rawCandidates ?? []).filter(
    (c: ContentCandidate) =>
      !(c.matched_groups ?? []).includes(NOISE_LABEL) &&
      isBriefingRelevant(c.title, c.summary_ko)
  )

  // 알맹이 가드: 본문·요약이 빈약한 stub 기사 제외(인사이트 꼭지 작성 불가).
  // 단, 가드가 후보를 최소치 아래로 깎으면 짧은 기사도 살려 브리핑 자체는 성립시킨다.
  const substantial = relevant.filter(hasSubstance)
  const candidates = substantial.length >= minArticles ? substantial : relevant

  console.log(
    `[브리핑] 후보 ${rawCandidates?.length ?? 0}건 → 관련 ${relevant.length}건 → 알맹이 ${substantial.length}건 → 사용 ${candidates.length}건`
  )

  if (candidates.length === 0) {
    console.log('[브리핑] 대상 기사 없음 — 스킵')
    return { ok: false, reason: '대상 기사 없음' }
  }

  // 4. 선정
  const selected = selectArticles(candidates as ContentCandidate[], now, windowHours, topN)
  const sourceContentIds = selected.map(a => a.id)

  console.log(`[브리핑] 선정 ${selected.length}건: ${selected.map(a => a.title.slice(0, 30)).join(' | ')}`)

  if (selected.length < minArticles) {
    console.log(`[브리핑] 선정 ${selected.length}건 < 최소 ${minArticles}건 — 짧은 브리핑으로 진행`)
  }

  // 5. LLM 스크립트 생성
  const userPrompt = buildUserPrompt(selected, dateParts)
  const systemPrompt = (
    await loadPrompt(admin, 'briefing_script', BRIEFING_SYSTEM_FALLBACK)
  ).replaceAll('{host_name}', hostName)
  const { text: scriptRaw, errorReason } = await llmCompleteDetailed('briefing', systemPrompt, userPrompt)

  if (!scriptRaw?.trim()) {
    console.error('[브리핑] 스크립트 생성 실패:', errorReason)
    await admin
      .from('briefings')
      .upsert({
        briefing_date: briefingDate,
        title: `${dateParts.month}월 ${dateParts.day}일 모닝브리핑`,
        script: null,
        source_content_ids: sourceContentIds,
        status: 'failed',
        error_reason: errorReason ?? 'LLM 반환 없음',
        generated_at: new Date().toISOString(),
      }, { onConflict: 'briefing_date' })
    return { ok: false, reason: '스크립트 생성 실패' }
  }

  const script = cleanScript(scriptRaw)
  const title = `${dateParts.month}월 ${dateParts.day}일 모닝브리핑`

  // 5-b. 홈 카드용 핵심 인사이트 3줄 생성 (실패해도 브리핑 저장은 진행)
  const highlights = await generateHighlights(
    selected.map(a => ({ id: a.id, title: a.title, summary_ko: a.summary_ko }))
  )
  console.log(`[브리핑] 핵심 인사이트 ${highlights.length}줄 생성`)

  // 6. upsert
  const publish = (opts?.autoPublish ?? false) && selected.length >= minArticles
  const { data: upserted, error: upsertError } = await admin
    .from('briefings')
    .upsert({
      briefing_date: briefingDate,
      title,
      script,
      source_content_ids: sourceContentIds,
      highlights: highlights.length > 0 ? highlights : null,
      status: publish ? 'published' : 'draft',
      error_reason: null,
      ...(publish ? { published_at: new Date().toISOString() } : {}),
      generated_at: new Date().toISOString(),
    }, { onConflict: 'briefing_date' })
    .select('id')
    .single()

  if (upsertError) {
    console.error('[브리핑] upsert 실패:', upsertError.message)
    return { ok: false, reason: 'DB 저장 실패' }
  }

  console.log(`[브리핑] 완료 id=${upserted.id} 선정=${selected.length}건 스크립트=${script.length}자`)

  return { ok: true, briefingId: upserted.id, selectedCount: selected.length }
}
