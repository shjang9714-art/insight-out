import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AiReportType, AiReportStatus } from '@/lib/types'
import { tagsOf2 } from '@/lib/contents/excerpt'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'
import { resolveStorageUrl } from '@/lib/storage/resolve-url'

export interface PublishedReportCard {
  id: string
  title: string
  summary: string | null
  cover_image_url: string | null
  publisher: string | null
  published_at: string
  type: AiReportType
  keywords: string[]
}

const UNDEFINED_COLUMN = '42703'
const MAX_REPORT_KEYWORDS = 4

interface ReportSourceKeywordRow {
  ai_report_id: string
  contents: {
    matched_groups: string[] | null
    matched_keywords: string[] | null
  } | null
}

async function getReportKeywordsById(
  supabase: SupabaseClient,
  reportIds: string[],
): Promise<Map<string, string[]>> {
  const keywordsByReport = new Map<string, string[]>()
  if (reportIds.length === 0) return keywordsByReport

  const { data, error } = await supabase
    .from('ai_report_sources')
    .select('ai_report_id, contents(matched_groups, matched_keywords)')
    .in('ai_report_id', reportIds)
    .not('content_id', 'is', null)

  if (error) {
    console.error('[reports] 근거 키워드 조회 실패:', error.message)
    return keywordsByReport
  }

  const frequencies = new Map<string, Map<string, { label: string; count: number }>>()
  for (const row of (data ?? []) as unknown as ReportSourceKeywordRow[]) {
    if (!row.contents) continue
    const sourceTags = tagsOf2(
      row.contents.matched_groups ?? [],
      row.contents.matched_keywords ?? [],
      '',
    )
    const reportFrequencies = frequencies.get(row.ai_report_id) ?? new Map()
    for (const label of sourceTags) {
      const key = label.trim().toLocaleLowerCase('ko-KR')
      if (!key) continue
      const current = reportFrequencies.get(key)
      reportFrequencies.set(key, {
        label: current?.label ?? label.trim(),
        count: (current?.count ?? 0) + 1,
      })
    }
    frequencies.set(row.ai_report_id, reportFrequencies)
  }

  for (const reportId of reportIds) {
    const ranked = [...(frequencies.get(reportId)?.values() ?? [])]
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko-KR'))
      .map(({ label }) => label)
    keywordsByReport.set(
      reportId,
      tagsOf2([], ranked, '').slice(0, MAX_REPORT_KEYWORDS),
    )
  }

  return keywordsByReport
}

/** 서비스 카드 리스트용 — published_at is not null(발행됨) 카드만, 최신순(275). */
export async function getPublishedReports(supabase: SupabaseClient): Promise<PublishedReportCard[]> {
  try {
    const { data, error } = await supabase
      .from('ai_reports')
      .select('id, title, summary, cover_image_url, publisher, published_at, type')
      .not('published_at', 'is', null)
      .order('published_at', { ascending: false })

    if (error) {
      if ((error as { code?: string }).code !== UNDEFINED_COLUMN) {
        console.error('[reports] getPublishedReports 실패:', error.message)
      }
      return []
    }
    const reports = (data ?? []) as Omit<PublishedReportCard, 'keywords'>[]
    const keywordsByReport = await getReportKeywordsById(
      supabase,
      reports.map(({ id }) => id),
    )

    return reports.map((report) => ({
      ...report,
      summary: report.summary ? stripLlmArtifacts(report.summary) : null,
      cover_image_url: resolveStorageUrl(report.cover_image_url),
      keywords: keywordsByReport.get(report.id) ?? [],
    }))
  } catch (e) {
    console.error('[reports] getPublishedReports 실패:', e)
    return []
  }
}

export interface ReportDetail {
  id: string
  title: string
  type: AiReportType
  status: AiReportStatus
  summary: string | null
  body_html: string | null
  body_md: string | null
  cover_image_url: string | null
  publisher: string | null
  topic: string | null
  published_at: string | null
  created_at: string
  updated_at: string
  keywords: string[]
}

/** 상세용 전체 조회. 신규 컬럼(274) 미적용 시 레거시 컬럼만으로 재조회(graceful). */
export async function getReport(supabase: SupabaseClient, id: string): Promise<ReportDetail | null> {
  const { data, error } = await supabase
    .from('ai_reports')
    .select('id, title, type, status, summary, body_html, body_md, cover_image_url, publisher, topic, published_at, created_at, updated_at')
    .eq('id', id)
    .single()

  if (!error && data) {
    const keywordsByReport = await getReportKeywordsById(supabase, [id])
    return {
      ...(data as Omit<ReportDetail, 'keywords'>),
      cover_image_url: resolveStorageUrl(data.cover_image_url),
      keywords: keywordsByReport.get(id) ?? [],
    }
  }

  if ((error as { code?: string } | null)?.code === UNDEFINED_COLUMN) {
    const { data: legacy, error: legacyErr } = await supabase
      .from('ai_reports')
      .select('id, title, type, status, body_md, created_at, updated_at')
      .eq('id', id)
      .single()
    if (legacyErr || !legacy) return null
    return {
      ...legacy,
      summary: null,
      body_html: null,
      cover_image_url: null,
      publisher: null,
      topic: null,
      published_at: null,
      keywords: [],
    } as ReportDetail
  }

  return null
}
