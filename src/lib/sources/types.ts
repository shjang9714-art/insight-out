export type ImportSourceType = 'news_site' | 'youtube_channel'
export type SourceImportFormat = 'csv' | 'tsv' | 'auto'
export type SourceImportMode = 'validate' | 'commit'
export type SourceImportStatus = 'success' | 'duplicate' | 'error'

export interface SourceImportRow {
  index: number
  name: string
  type: ImportSourceType | string
  rss_url: string
  is_active: boolean
  crawl_interval_minutes: number
  status: SourceImportStatus
  message: string
}

export interface SourceImportSummary {
  success: number
  duplicate: number
  error: number
}

export interface SourceImportResponse {
  rows: SourceImportRow[]
  summary: SourceImportSummary
  error?: string
}
