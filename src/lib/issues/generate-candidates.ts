import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { llmComplete } from '@/lib/llm'
import { looseJsonParse } from '@/lib/llm/parse'
import { tokenizeTitle, jaccardSimilarity, keywordsJaccard } from '@/lib/feed-dedup'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

// ─── 공개 타입 ────────────────────────────────────────────────────────────────

export interface IssueCandidate {
  title: string
  summary: string
  match_keywords: string[]   // 향후 자동매칭용 5~8
  content_ids: string[]      // 환각 가드 통과분
  theme: string              // 출처 matched_group
}

// ─── 내부 타입 ────────────────────────────────────────────────────────────────

interface ContentRow {
  id: string
  title: string
  summary_ko: string | null
  matched_groups: string[] | null
  importance_score: number | null
  cluster_id: string | null
  collected_at: string
  published_at: string | null
}

interface ExistingIssue {
  title: string
  match_keywords: string[]
}

// ─── 프롬프트 ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `당신은 LG U+ B2B 시장 인텔리전스 분석가다.
주어진 기사들이 이루는 **지속적 이슈(테마/내러티브) 하나**를 정의하라.
단발 헤드라인이 아닌 앞으로도 지속될 테마 이름으로 작성.

반드시 지켜야 할 규칙:
1. 추측 금지 — 제공된 사실만 기술.
2. content_ids는 반드시 입력 목록에 존재하는 id만.
3. match_keywords는 이슈를 자동 감지할 핵심 단어 5~8개.
4. title·summary 서술문 안에 <quote> 같은 태그나 [content_id]·[uuid] 형태의 근거 ID를 절대 쓰지 마라. 근거는 content_ids 배열로만 표현한다.
5. JSON 객체만 출력.

출력 스키마:
{
  "title": "지속 테마형 이슈명(15자 이내)",
  "summary": "한 줄 요약",
  "match_keywords": ["키워드1", "키워드2"],
  "content_ids": ["uuid1", "uuid2"]
}`

function buildUserPrompt(theme: string, articles: ContentRow[]): string {
  const lines = articles.map(a =>
    `[${a.id}] ${a.title}` + (a.summary_ko ? `\n요약: ${a.summary_ko}` : '')
  ).join('\n\n')
  return `주제 그룹: ${theme}\n\n기사 목록:\n${lines}`
}

// ─── LLM 출력 파싱 ────────────────────────────────────────────────────────────

function parseCandidate(raw: string, validIdSet: Set<string>): Omit<IssueCandidate, 'theme'> | null {
  const parsed = looseJsonParse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const obj = parsed as Record<string, unknown>

  const title = typeof obj.title === 'string' ? stripLlmArtifacts(obj.title.trim()) : ''
  const summary = typeof obj.summary === 'string' ? stripLlmArtifacts(obj.summary.trim()) : ''
  if (!title || !summary) return null

  const match_keywords = Array.isArray(obj.match_keywords)
    ? (obj.match_keywords as unknown[]).filter((k): k is string => typeof k === 'string' && k.trim().length > 0).map(k => k.trim())
    : []

  // 환각 가드: 입력 집합에 존재하는 id만
  const rawIds = Array.isArray(obj.content_ids)
    ? (obj.content_ids as unknown[]).filter((id): id is string => typeof id === 'string')
    : []
  const content_ids = rawIds.filter(id => validIdSet.has(id))

  return { title, summary, match_keywords, content_ids }
}

// ─── 후보 간 중복 제거 ────────────────────────────────────────────────────────

function dedupCandidates(
  candidates: IssueCandidate[],
  titleTh = 0.35,
  kwTh = 0.5,
): IssueCandidate[] {
  const kept: { candidate: IssueCandidate; tokens: string[] }[] = []
  for (const c of candidates) {
    const tokens = tokenizeTitle(c.title)
    const isDup = kept.some(k => {
      if (jaccardSimilarity(tokens, k.tokens) >= titleTh) return true
      if (keywordsJaccard(c.match_keywords, k.candidate.match_keywords) >= kwTh) return true
      return false
    })
    if (!isDup) kept.push({ candidate: c, tokens })
  }
  return kept.map(k => k.candidate)
}

// ─── 기존 이슈 대비 중복 제거 ────────────────────────────────────────────────

function filterAgainstExisting(
  candidates: IssueCandidate[],
  existingIssues: ExistingIssue[],
  titleTh = 0.4,
  kwTh = 0.5,
): { survivors: IssueCandidate[]; skipped: number } {
  let skipped = 0
  const survivors: IssueCandidate[] = []

  for (const c of candidates) {
    const cTokens = tokenizeTitle(c.title)
    const isDup = existingIssues.some(ex => {
      if (jaccardSimilarity(cTokens, tokenizeTitle(ex.title)) >= titleTh) return true
      if (keywordsJaccard(c.match_keywords, ex.match_keywords) >= kwTh) return true
      return false
    })
    if (isDup) {
      skipped++
    } else {
      survivors.push(c)
    }
  }
  return { survivors, skipped }
}

// ─── 메인 함수 ───────────────────────────────────────────────────────────────

export async function generateIssueCandidates(
  admin: SupabaseClient,
  opts?: { days?: number; maxCandidates?: number; minGroupSize?: number },
): Promise<{ candidates: IssueCandidate[]; skipped: number }> {
  const days = Math.max(1, opts?.days ?? 7)
  const maxCandidates = Math.max(1, Math.min(opts?.maxCandidates ?? 8, 20))
  const minGroupSize = Math.max(1, opts?.minGroupSize ?? 3)

  const since = new Date(Date.now() - days * 86_400_000).toISOString()

  try {
    // 1. 최근 published 콘텐츠 (matched_groups 있는 것)
    const { data: rawContents, error: contentsError } = await admin
      .from('contents')
      .select('id, title, summary_ko, matched_groups, importance_score, cluster_id, collected_at, published_at')
      .eq('status', 'published')
      .gte('collected_at', since)
      .not('matched_groups', 'is', null)
      .is('deleted_at', null)
      .limit(400)

    if (contentsError) {
      console.error('[IssueCandidates] 콘텐츠 조회 실패:', contentsError.message)
      return { candidates: [], skipped: 0 }
    }

    const contents = (rawContents ?? []) as ContentRow[]
    const validContents = contents.filter(c => c.matched_groups && c.matched_groups.length > 0)

    if (validContents.length === 0) {
      console.log('[IssueCandidates] 태깅된 콘텐츠 없음')
      return { candidates: [], skipped: 0 }
    }

    // 2. matched_groups 빈도 집계
    const groupFreq = new Map<string, ContentRow[]>()
    for (const c of validContents) {
      for (const g of c.matched_groups ?? []) {
        if (!groupFreq.has(g)) groupFreq.set(g, [])
        groupFreq.get(g)!.push(c)
      }
    }

    const topGroups = [...groupFreq.entries()]
      .filter(([, rows]) => rows.length >= minGroupSize)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, maxCandidates)

    if (topGroups.length === 0) {
      console.log('[IssueCandidates] 최소 그룹 크기 미달 그룹 없음')
      return { candidates: [], skipped: 0 }
    }

    // 3. 기존 이슈 조회 (중복 대비)
    const { data: existingData } = await admin
      .from('issues')
      .select('title, match_keywords')
      .neq('status', 'archived')

    const existingIssues: ExistingIssue[] = (existingData ?? []).map((r: { title: string; match_keywords: string[] }) => ({
      title: r.title,
      match_keywords: r.match_keywords ?? [],
    }))

    // 4. 그룹별 LLM 생성
    const rawCandidates: IssueCandidate[] = []

    for (const [theme, groupArticles] of topGroups) {
      try {
        // cluster_id null 우선(대표) + importance_score desc, 상위 8건
        const sorted = [...groupArticles].sort((a, b) => {
          const aIsRep = a.cluster_id === null ? 0 : 1
          const bIsRep = b.cluster_id === null ? 0 : 1
          if (aIsRep !== bIsRep) return aIsRep - bIsRep
          return (b.importance_score ?? 0) - (a.importance_score ?? 0)
        })
        const articles = sorted.slice(0, 8)
        const validIdSet = new Set(articles.map(a => a.id))

        const raw = await llmComplete('report', SYSTEM_PROMPT, buildUserPrompt(theme, articles))
        if (!raw) {
          console.warn(`[IssueCandidates] theme="${theme}" LLM 응답 없음 — 건너뜀`)
          continue
        }

        const parsed = parseCandidate(raw, validIdSet)
        if (!parsed) {
          console.warn(`[IssueCandidates] theme="${theme}" 파싱 실패 — 건너뜀`)
          continue
        }

        rawCandidates.push({ ...parsed, theme })
        console.log(`[IssueCandidates] theme="${theme}" 생성 완료 (contents=${parsed.content_ids.length})`)
      } catch (err) {
        console.error(`[IssueCandidates] theme="${theme}" 오류:`, err instanceof Error ? err.message : String(err))
      }
    }

    // 5. 후보 간 중복 제거
    const dedupedCandidates = dedupCandidates(rawCandidates)

    // 6. 기존 이슈 대비 중복 제거
    const { survivors, skipped } = filterAgainstExisting(dedupedCandidates, existingIssues)

    return { candidates: survivors, skipped }
  } catch (err) {
    console.error('[IssueCandidates] 처리 실패:', err instanceof Error ? err.message : String(err))
    return { candidates: [], skipped: 0 }
  }
}
