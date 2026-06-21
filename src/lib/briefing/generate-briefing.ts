import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { llmComplete } from '@/lib/llm'
import { isBriefingRelevant } from '@/lib/feed-blocklist'

// ─── 환경변수 기본값 ─────────────────────────────────────────────────────────

const WINDOW_HOURS = Number(process.env.BRIEFING_WINDOW_HOURS ?? 24)
const TOP_N = Number(process.env.BRIEFING_TOP_N ?? 4)
const MIN_ARTICLES = Number(process.env.BRIEFING_MIN_ARTICLES ?? 3)

// ─── 복합 점수 가중치 (한 곳에 모아 튜닝 용이) ──────────────────────────────

const W_RECENCY = 10
const W_EDITOR = 5
const W_VIEW = 1.5
const W_BOOKMARK = 3
const W_INDUSTRY = 5

const CATEGORY_WEIGHT: Record<string, number> = {
  '뉴스': 3,
  '리포트': 5,
  '웹인사이트': 4,
  'AI보고서': 4,
  '유튜브': 0,
}

const MAX_PER_CATEGORY = 2
const SUMMARY_INPUT_MAXCHARS = 400

// ─── 산업 주제 버킷 ──────────────────────────────────────────────────────────
// matched_groups 에는 keyword_groups.name 이 저장된다(quality.ts). name 이 슬러그('ai_tech')인지
// 한글 라벨('인공지능')인지 레포 SQL 로는 확정 불가(시드가 라이브 DB 에만 존재) → 양쪽 모두 커버.
// ⚠️ 'ai' 는 'ai_tech' 의 부분문자열이므로 ai 버킷을 tech 보다 먼저 검사해야 한다(아래 순서 유지).
const TOPIC_BUCKETS = {
  ai: ['ai_tech', '인공지능', 'ai'],
  telecom: ['telecom_b2b', 'telecom', '통신', 'b2b'],
  tech: ['bigtech', 'it_trend', '기술', 'tech'],
} as const

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

const SYSTEM_PROMPT =
  '당신은 LG유플러스 임직원을 위한 1인 모닝 라디오 \'모닝브리핑\'의 진행자다.\n' +
  '입력으로 오늘 선정된 통신·테크·AI 산업 기사 3~5건(제목·요약·카테고리)이 주어진다.\n' +
  '이를 한 명의 진행자가 친근하게 풀어 주는 한국어 팟캐스트 스크립트로 작성하라.\n\n' +
  '대상·목적:\n' +
  '- 청취자는 LG유플러스 전 임직원. 특정 부서가 아니라 모두가 알아야 할 산업 전반(통신·테크·AI)의 큰 흐름을 쉽게 전달한다.\n' +
  '- 특정 회사 동향 나열이 아니라, 오늘 업계에서 무슨 일이 있었고 왜 중요한지 맥락을 짚어 준다.\n' +
  '- 통신은 B2B(기업·엔터프라이즈) 관점이다. 요금제·단말·소비자 프로모션 같은 B2C 소식은 다루지 않는다.\n\n' +
  '스타일:\n' +
  '- 1인 진행 팟캐스트 톤. 따뜻하고 자연스러운 구어체로, 청취자에게 말 걸듯 진행한다.\n' +
  '- 구조: 짧은 인사·오늘 날짜·오늘 다룰 주제 한두 줄 예고 → 기사별 2~4문장 꼭지(중요도 높은 순, 자연스러운 연결어로 이어 가기) → 한 줄 정리·마무리 인사.\n' +
  '- 딱딱한 보도체 금지. 그렇다고 과장·농담 과다도 금지. 차분하고 신뢰감 있는 진행자.\n\n' +
  '규칙:\n' +
  '- TTS 로 읽힐 글이다. 마크다운·이모지·불릿·따옴표·괄호 메모 금지. 순수 문장만.\n' +
  '- 영어 약어·숫자는 자연스러운 한국어 구어로(예: "AI" 는 "에이아이", "5G" 는 "파이브지"). 단위·금액도 읽기 쉽게.\n' +
  '- 사실만. 입력에 없는 내용 추측·창작 금지. 기사 출처/회사명은 입력대로.\n' +
  '- 전체 분량 1,200~2,000자(약 3~5분 낭독). 문장은 짧고 끊어 읽기 쉽게.\n' +
  '- 출력은 스크립트 본문만. 제목·머리말·설명 없이.'

// ─── 타입 ────────────────────────────────────────────────────────────────────

type GenerateResult =
  | { ok: true; briefingId: string; selectedCount: number }
  | { ok: false; reason: string }

interface ContentCandidate {
  id: string
  title: string
  summary_ko: string | null
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

function computeScore(c: ContentCandidate, now: Date): number {
  const pubDate = c.published_at ? new Date(c.published_at) : new Date(c.collected_at)
  const hoursAgo = Math.max(0, (now.getTime() - pubDate.getTime()) / 3_600_000)
  const recencyBonus = Math.max(0, (1 - hoursAgo / WINDOW_HOURS)) * W_RECENCY

  const catWeight = CATEGORY_WEIGHT[c.category] ?? 2
  const editorBonus = c.is_editor_pick ? W_EDITOR : 0
  const viewScore = Math.log1p(c.view_count) * W_VIEW
  const bookmarkScore = Math.log1p(c.bookmark_count) * W_BOOKMARK
  const industryBonus = isCoreIndustry(c.matched_groups) ? W_INDUSTRY : 0

  return c.importance_score + recencyBonus + catWeight + editorBonus + viewScore + bookmarkScore + industryBonus
}

// ─── 선정 로직 (중복·카테고리·주제 균형) ─────────────────────────────────────

function selectArticles(candidates: ContentCandidate[], now: Date): ContentCandidate[] {
  const scored = candidates.map(c => ({ c, score: computeScore(c, now) }))
  scored.sort((a, b) => b.score - a.score)

  const selected: ContentCandidate[] = []
  const usedClusters = new Set<string>()
  const categoryCounts: Record<string, number> = {}
  const topicCounts: Record<string, number> = {}
  const maxPerTopic = Math.ceil(TOP_N / 2)

  for (const { c } of scored) {
    if (selected.length >= TOP_N) break

    if (c.cluster_id && usedClusters.has(c.cluster_id)) continue

    const catCount = categoryCounts[c.category] ?? 0
    if (catCount >= MAX_PER_CATEGORY) continue

    const topic = getTopicBucket(c.matched_groups) ?? 'other'
    const topicCount = topicCounts[topic] ?? 0
    if (topic !== 'other' && topicCount >= maxPerTopic) continue

    selected.push(c)
    if (c.cluster_id) usedClusters.add(c.cluster_id)
    categoryCounts[c.category] = catCount + 1
    topicCounts[topic] = topicCount + 1
  }

  return selected
}

// ─── 유저 프롬프트 구성 ──────────────────────────────────────────────────────

function buildUserPrompt(articles: ContentCandidate[], dateParts: { year: number; month: number; day: number }): string {
  const lines: string[] = [
    `오늘 날짜: ${dateParts.year}년 ${dateParts.month}월 ${dateParts.day}일`,
    '',
  ]
  articles.forEach((a, i) => {
    lines.push(`[기사 ${i + 1}] (카테고리: ${a.category})`)
    lines.push(`제목: ${a.title}`)
    if (a.summary_ko) {
      lines.push(`요약: ${a.summary_ko.slice(0, SUMMARY_INPUT_MAXCHARS)}`)
    }
    lines.push('')
  })
  return lines.join('\n')
}

// ─── 스크립트 후처리 ─────────────────────────────────────────────────────────

function cleanScript(raw: string): string {
  let s = raw.trim()
  s = s.replace(/^(스크립트|Script)\s*[:：]\s*/i, '')
  return s.trim()
}

// ─── 메인 함수 ───────────────────────────────────────────────────────────────

export async function generateBriefing(
  opts?: { force?: boolean; date?: string }
): Promise<GenerateResult> {
  const admin = createAdminClient()
  const now = new Date()

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
  const windowMs = WINDOW_HOURS * 3_600_000
  const windowStart = new Date(now.getTime() - windowMs).toISOString()

  const { data: rawCandidates, error: fetchError } = await admin
    .from('contents')
    .select('id, title, summary_ko, category, importance_score, view_count, bookmark_count, is_editor_pick, cluster_id, matched_groups, published_at, collected_at')
    .eq('status', 'published')
    .neq('category', '유튜브')
    .or(`published_at.gte.${windowStart},and(published_at.is.null,collected_at.gte.${windowStart})`)
    .order('importance_score', { ascending: false })
    .limit(200)

  if (fetchError) {
    console.error('[브리핑] 후보 조회 실패:', fetchError.message)
    return { ok: false, reason: '후보 기사 조회 실패' }
  }

  const candidates = (rawCandidates ?? []).filter(
    (c: ContentCandidate) => isBriefingRelevant(c.title, c.summary_ko)
  )

  console.log(`[브리핑] 후보 ${rawCandidates?.length ?? 0}건 → B2B 필터 후 ${candidates.length}건`)

  if (candidates.length === 0) {
    console.log('[브리핑] 대상 기사 없음 — 스킵')
    return { ok: false, reason: '대상 기사 없음' }
  }

  // 4. 선정
  const selected = selectArticles(candidates as ContentCandidate[], now)
  const sourceContentIds = selected.map(a => a.id)

  console.log(`[브리핑] 선정 ${selected.length}건: ${selected.map(a => a.title.slice(0, 30)).join(' | ')}`)

  if (selected.length < MIN_ARTICLES) {
    console.log(`[브리핑] 선정 ${selected.length}건 < 최소 ${MIN_ARTICLES}건 — 짧은 브리핑으로 진행`)
  }

  // 5. LLM 스크립트 생성
  const userPrompt = buildUserPrompt(selected, dateParts)
  const scriptRaw = await llmComplete('briefing', SYSTEM_PROMPT, userPrompt)

  if (!scriptRaw?.trim()) {
    console.error('[브리핑] 스크립트 생성 실패 (LLM 반환 없음)')
    await admin
      .from('briefings')
      .upsert({
        briefing_date: briefingDate,
        title: `${dateParts.month}월 ${dateParts.day}일 모닝브리핑`,
        script: null,
        source_content_ids: sourceContentIds,
        status: 'failed',
        generated_at: new Date().toISOString(),
      }, { onConflict: 'briefing_date' })
    return { ok: false, reason: '스크립트 생성 실패' }
  }

  const script = cleanScript(scriptRaw)
  const title = `${dateParts.month}월 ${dateParts.day}일 모닝브리핑`

  // 6. upsert
  const { data: upserted, error: upsertError } = await admin
    .from('briefings')
    .upsert({
      briefing_date: briefingDate,
      title,
      script,
      source_content_ids: sourceContentIds,
      status: 'draft',
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
