import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getPublishedReports } from '@/lib/reports/query'
import { toExcerpt, tagsOf2 } from '@/lib/contents/excerpt'
import { coverUrlsForList } from '@/lib/contents/topic-cover'
import type { AiReportType } from '@/lib/types'

// 지시서 2026-08-04c — "AI 리포트"는 전략보고서(ai_reports)와 지식보고서(contents
// category='지식보고서')를 한 목록으로 병합한 화면이다. 탭을 쪼개지 않고 카드마다
// 종류 배지("전략보고서"/"지식보고서")로만 구분한다. 두 소스는 테이블이 달라
// 서버에서 각자 조회 후 발행일 기준으로 합쳐 정렬한다.

export interface AiReportBoardItem {
  id: string
  kind: 'strategy' | 'knowledge'
  title: string
  summary: string | null
  coverImageUrl: string | null
  publisher: string | null
  /** 정렬·표시 기준 날짜 — 전략보고서는 published_at, 지식보고서는 collected_at(기존 ContentsBoard와 동일 관례) */
  dateIso: string
  keywords: string[]
  /** 전략보고서에만 존재(시장동향/경쟁사분석 등) — 카드 표지 색상 구분용, 종류 배지 문구는 아님 */
  strategyType?: AiReportType
}

const SCHEMA_MISSING_CODES = new Set(['22P02', '42P01', 'PGRST205'])

interface KnowledgeReportRow {
  id: string
  title: string
  summary_ko: string | null
  body_original: string | null
  collected_at: string
  published_at: string | null
  thumbnail_url: string | null
  matched_groups: string[] | null
  matched_keywords: string[] | null
  sources: { name: string } | null
}

/** 지식보고서(콘텐츠 category='지식보고서') 발행분 — ContentsBoard가 쓰던 조회 조건과 동일. */
async function getKnowledgeReportItems(supabase: SupabaseClient): Promise<AiReportBoardItem[]> {
  const { data, error } = await supabase
    .from('contents')
    .select('id, title, summary_ko, body_original, collected_at, published_at, thumbnail_url, matched_groups, matched_keywords, sources(name)')
    .eq('status', 'published')
    .eq('category', '지식보고서')
    .order('collected_at', { ascending: false })
    .limit(100)

  if (error) {
    const code = (error as { code?: string }).code
    if (!code || (!SCHEMA_MISSING_CODES.has(code) && !error.message.includes('지식보고서'))) {
      console.error('[ai-report-board] 지식보고서 조회 실패:', error.message)
    }
    return []
  }

  const rows = (data ?? []) as unknown as KnowledgeReportRow[]
  const coverUrls = coverUrlsForList(rows.map((row) => ({
    id: row.id,
    thumbnail_url: row.thumbnail_url,
    matched_groups: row.matched_groups,
    matched_keywords: row.matched_keywords,
    category: '지식보고서',
  })))

  return rows.map((row, index) => ({
    id: row.id,
    kind: 'knowledge' as const,
    title: row.title,
    summary: toExcerpt(row.summary_ko, row.body_original),
    coverImageUrl: coverUrls[index],
    publisher: row.sources?.name ?? null,
    dateIso: row.collected_at,
    keywords: tagsOf2(row.matched_groups ?? [], row.matched_keywords ?? [], '지식보고서').slice(0, 4),
  }))
}

/** 전략보고서 + 지식보고서를 발행일 기준 내림차순으로 병합. */
export async function getAiReportBoardItems(supabase: SupabaseClient): Promise<AiReportBoardItem[]> {
  const [strategyReports, knowledgeItems] = await Promise.all([
    getPublishedReports(supabase),
    getKnowledgeReportItems(supabase),
  ])

  const strategyItems: AiReportBoardItem[] = strategyReports.map((r) => ({
    id: r.id,
    kind: 'strategy' as const,
    title: r.title,
    summary: r.summary,
    coverImageUrl: r.cover_image_url,
    publisher: r.publisher,
    dateIso: r.published_at,
    keywords: r.keywords,
    strategyType: r.type,
  }))

  return [...strategyItems, ...knowledgeItems].sort(
    (a, b) => new Date(b.dateIso).getTime() - new Date(a.dateIso).getTime()
  )
}
