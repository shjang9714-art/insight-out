import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AiReportType, AiReportStatus } from '@/lib/types'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

export interface PublishedReportCard {
  id: string
  title: string
  summary: string | null
  cover_image_url: string | null
  publisher: string | null
  published_at: string
  type: AiReportType
}

const UNDEFINED_COLUMN = '42703'

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
    return ((data ?? []) as PublishedReportCard[]).map((report) => ({
      ...report,
      summary: report.summary ? stripLlmArtifacts(report.summary) : null,
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
}

/** 상세용 전체 조회. 신규 컬럼(274) 미적용 시 레거시 컬럼만으로 재조회(graceful). */
export async function getReport(supabase: SupabaseClient, id: string): Promise<ReportDetail | null> {
  const { data, error } = await supabase
    .from('ai_reports')
    .select('id, title, type, status, summary, body_html, body_md, cover_image_url, publisher, topic, published_at, created_at, updated_at')
    .eq('id', id)
    .single()

  if (!error && data) return data as ReportDetail

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
    } as ReportDetail
  }

  return null
}
