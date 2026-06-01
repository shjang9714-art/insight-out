export type UserRole = 'user' | 'admin'

export type Department =
  | 'Enterprise사업부문'
  | 'SMB사업부문'
  | '공공사업부문'
  | '기술부문'
  | '마케팅부문'
  | '기타'

export type NewsletterFrequency = 'daily' | 'weekly' | 'twice_weekly' | 'none'

export type ContentFilterMode = 'my_services' | 'all'

export interface UserProfile {
  id: string
  email: string
  name: string
  department: Department
  team: string
  position?: string
  role: UserRole
  content_filter_mode: ContentFilterMode
  created_at: string
  updated_at: string
}

export interface Service {
  id: string
  name: string
  description?: string
  icon?: string
  order: number
}

export interface UserService {
  user_id: string
  service_id: string
  is_pinned: boolean
}

export interface NewsletterSubscription {
  user_id: string
  frequency: NewsletterFrequency
  is_active: boolean
  newsletter_email?: string
}

export interface OnboardingStep1 {
  name: string
  team: string
  position: string
  content_filter_mode: ContentFilterMode
  selected_services: string[]
}

export interface OnboardingStep2 {
  service_ids: string[]
}

export interface OnboardingStep3 {
  frequency: NewsletterFrequency
  newsletter_email: string
}

// ============================================================
// 콘텐츠 도메인 (schema.sql Phase 1-B)
// ============================================================

export type ContentCategory =
  | '뉴스' | '가트너' | 'KRG' | '웹인사이트'
  | '오피니언' | '뉴스레터' | 'AI보고서' | '유튜브'

export type SourceType =
  | 'news_site' | 'report_publisher' | 'opinion_channel'
  | 'newsletter' | 'youtube_channel'

export type AiReportType =
  | '시장동향' | '경쟁사분석' | '키워드분석' | '서비스리포트' | '자유주제'

export type AiReportStatus = 'draft' | 'generating' | 'completed' | 'failed'

export interface Source {
  id: string
  name: string
  type: SourceType
  url?: string
  rss_url?: string
  is_active: boolean
  crawl_interval_minutes?: number | null
  last_crawled_at?: string | null
  order: number
  created_at: string
  updated_at: string
}

export interface Keyword {
  id: string
  name: string
  service_id?: string | null
  is_competitor: boolean
  created_at: string
}

export interface Content {
  id: string
  category: ContentCategory
  source_id?: string | null
  title: string
  title_original?: string | null
  summary_ko?: string | null
  body_original?: string | null
  body_translated_ko?: string | null
  original_language: string
  author?: string | null
  original_url?: string | null
  thumbnail_url?: string | null
  file_path?: string | null
  title_hash?: string | null
  body_hash?: string | null
  view_count: number
  bookmark_count: number
  is_editor_pick: boolean
  status: 'pending' | 'published' | 'rejected'
  published_at?: string | null
  collected_at: string
  created_at: string
  updated_at: string
}

export interface ContentService {
  content_id: string
  service_id: string
  created_at: string
}

export interface ContentKeyword {
  content_id: string
  keyword_id: string
  created_at: string
}

export interface YoutubeVideoRow {
  id: string
  source_id?: string | null
  video_id: string
  title: string
  channel_name: string
  channel_id?: string | null
  description?: string | null
  thumbnail_url?: string | null
  duration_seconds?: number | null
  view_count?: number | null
  published_at?: string | null
  collected_at: string
  created_at: string
  updated_at: string
}

export interface AiReport {
  id: string
  user_id: string
  type: AiReportType
  status: AiReportStatus
  title: string
  prompt?: string | null
  body_md?: string | null
  file_path?: string | null
  error_message?: string | null
  created_at: string
  updated_at: string
}

export interface AiReportSource {
  ai_report_id: string
  content_id?: string | null
  youtube_video_id?: string | null
  created_at: string
}

// ============================================================
// 북마크·아카이빙 도메인
// ============================================================

export interface Bookmark {
  id: string
  user_id: string
  content_id?: string | null
  youtube_video_id?: string | null
  created_at: string
}

export interface Archive {
  id: string
  user_id: string
  name: string
  description?: string | null
  created_at: string
  updated_at: string
}

export interface ArchiveItem {
  archive_id: string
  content_id?: string | null
  youtube_video_id?: string | null
  note?: string | null
  order: number
  added_at: string
}

// ============================================================
// 카테고리 enum → UI 표시 라벨 매핑 (BL-2)
// ============================================================

export const CONTENT_CATEGORY_LABEL: Record<ContentCategory, string> = {
  '뉴스': '뉴스 & 미디어',
  '가트너': '가트너 리포트',
  'KRG': 'KRG 리포트',
  '웹인사이트': '웹 인사이트',
  '오피니언': '오피니언 채널',
  '뉴스레터': '뉴스레터',
  'AI보고서': 'AI 보고서',
  '유튜브': '유튜브 영상',
}
