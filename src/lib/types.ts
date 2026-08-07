import type { LensKey } from './lens'

export type UserRole = 'user' | 'admin' | 'super_admin' | 'viewer'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

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
  team_name: string
  position?: string
  role: UserRole
  content_filter_mode: ContentFilterMode
  created_at: string
  updated_at: string
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
  team_name: string
  default_lens: LensKey
  /** 맞춤 추천 피드 카테고리 키 배열 (FEED_CATEGORIES, users.feed_categories 에 저장) */
  selected_categories: string[]
}

export interface OnboardingStep3 {
  frequency: NewsletterFrequency
  newsletter_email: string
}

// ============================================================
// 콘텐츠 도메인 (schema.sql Phase 1-B)
// ============================================================

export type ContentCategory =
  // 현재 UI 카테고리 (6개)
  | '뉴스' | '리서치' | '웹인사이트' | '유튜브' | 'AI분석' | '전략보고서'
  // DB enum 유지 (기존 데이터 — UI 카테고리로 매핑해 표시)
  | '리포트' | '기업자료' | 'AI보고서' | '지식보고서'
  // deprecated: 수집 미사용
  | '가트너' | 'KRG' | '오피니언' | '뉴스레터'

export type SourceType =
  | 'news_site' | 'report_publisher' | 'web_insight'
  | 'newsletter' | 'youtube_channel'

export type CollectionMethod = 'rss' | 'api' | 'html' | 'manual' | 'youtube'

export type TagType = 'industry' | 'company' | 'tech' | 'market' | 'policy' | 'content_type'

export interface KeywordGroup {
  id: string
  name: string
  kind: string
  tag_type: TagType
  description?: string | null
  include_patterns: string[]
  exclude_patterns: string[]
  weight: number
  signal_hint?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type AiReportType =
  | '시장동향' | '경쟁사분석' | '키워드분석' | '서비스리포트' | '자유주제'

export type AiReportStatus = 'draft' | 'generating' | 'completed' | 'failed'

// 콘텐츠 품질·승인 상태 (BL-4)
export type ContentStatus = 'pending' | 'published' | 'rejected'

// 크롤링 실행 결과 상태
export type CrawlStatus = 'success' | 'partial' | 'failed'

export interface Source {
  id: string
  name: string
  type: SourceType
  url?: string
  rss_url?: string
  is_active: boolean
  crawl_interval_minutes?: number | null
  collection_method: CollectionMethod
  trust_tier: number
  last_crawled_at?: string | null
  order: number
  created_at: string
  updated_at: string
}

export interface Content {
  id: string
  category: ContentCategory
  source_id?: string | null
  title: string
  title_original?: string | null
  summary_ko?: string | null
  body_original?: string | null
  body_markdown?: string | null
  body_fetched_at?: string | null
  body_translated_ko?: string | null
  transcript?: string | null
  transcript_ko?: string | null
  transcript_lang?: string | null
  transcript_fetched_at?: string | null
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
  cluster_id?: string | null
  importance_score: number
  status: ContentStatus
  review_reason?: string | null
  sentiment?: '긍정' | '중립' | '부정' | null
  published_at?: string | null
  collected_at: string
  created_at: string
  updated_at: string
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
  issue_id?: string | null
  created_at: string
}

export interface CrawlLog {
  id: string
  source_id?: string | null
  status: CrawlStatus
  fetched_count: number
  inserted_count: number
  duplicate_count: number
  held_count: number
  error_message?: string | null
  started_at: string
  finished_at?: string | null
  created_at: string
}

export type CompanyDocumentType =
  | '회사소개'
  | 'IR·실적'
  | '전략·보고서'
  | 'ESG'
  | '기술·제품'
  | '투자·피치덱'
  | '행사·발표'

export type CompanyDocumentGroup = '회사및사업' | '기술및제품' | '투자및경영'

export type CompanyDocumentSourceKind =
  | 'API'
  | 'RSS'
  | 'SITEMAP'
  | 'HTML_LIST'
  | 'HTML_DETAIL'
  | 'DOCUMENT_DIRECTORY'
  | 'HEADLESS_BROWSER'
  | 'MANUAL'

export interface CompanyDocument {
  content_id: string
  entity_id: string | null
  doc_type: CompanyDocumentType
  doc_group: CompanyDocumentGroup
  is_official: boolean
  source_kind: CompanyDocumentSourceKind
  page_count: number | null
  published_on: string | null
  official_status: string
  access_scope: string
  version_group_id: string | null
  prev_content_id: string | null
  ingest_status: string
  review_status: string
  dart_rcept_no: string | null
  created_at: string
  updated_at: string
}

export interface EntityDartMap {
  entity_id: string
  corp_code: string
  corp_name: string
  created_at: string
  updated_at: string
}

export interface DocumentSource {
  id: string
  entity_id: string
  name: string
  url: string
  source_kind: CompanyDocumentSourceKind
  collect_method: string
  target_file_types: string[]
  interval_minutes: number | null
  last_crawled_at: string | null
  last_success_at: string | null
  is_active: boolean
  error_state: string | null
  auto_publish: boolean
  created_at: string
  updated_at: string
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
// 관심업체 워치리스트 (지시서 93)
// ============================================================

export interface WatchlistItem {
  id: string
  user_id: string
  company: string
  created_at: string
  /** entities FK — 검색으로 추가 시 연결, 수동 입력(미매칭)은 null(225) */
  entity_id?: string | null
}

// ============================================================
// ============================================================
// AI 인사이트 카드 (지시서 89)
// ============================================================

export type InsightCardStatus = 'draft' | 'published' | 'archived'

export interface InsightCardCitation {
  content_id: string
  quote: string
}

export interface InsightCard {
  id: string
  period_start: string
  period_end: string
  scope: string
  topic: string
  headline: string
  card_headline?: string | null
  implication: string | null
  source_content_ids: string[]
  citations: InsightCardCitation[]
  status: InsightCardStatus
  generated_at: string | null
  created_at: string
  updated_at: string
}

// 카테고리 enum → UI 표시 라벨 매핑 (BL-2)
// ============================================================

export const CONTENT_CATEGORY_LABEL: Record<ContentCategory, string> = {
  // UI 카테고리 6개
  '뉴스': '뉴스',
  '리서치': '리서치',
  '웹인사이트': '웹인사이트',
  '유튜브': '유튜브',
  'AI분석': 'AI분석',
  '전략보고서': 'AI 리포트',
  // DB enum (기존 데이터)
  '리포트': '리포트',
  '기업자료': '기업자료',
  'AI보고서': 'AI 보고서',
  '지식보고서': '지식보고서',
  // deprecated
  '가트너': '가트너 리포트',
  'KRG': 'KRG 리포트',
  '오피니언': '오피니언 채널',
  '뉴스레터': '뉴스레터',
}

// ============================================================
// 엔티티 지식계층 (99-entities)
// ============================================================

export type EntityType = 'company' | 'tech' | 'product' | 'person' | 'policy' | 'industry'

export interface Entity {
  id: string
  canonical_name: string
  entity_type: EntityType
  description: string | null
  is_competitor: boolean
  service_id: string | null
  mention_count: number
  created_at: string
  updated_at: string
}

export interface ContentEntity {
  id: string
  content_id: string
  entity_id: string
  source: string
  score: number
  created_at: string
}

export const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  company:  '기업',
  tech:     '기술',
  product:  '제품',
  person:   '인물',
  policy:   '정책',
  industry: '산업',
}

// ============================================================
// 이슈 1급화 (101-issues)
// ============================================================

export type IssueStatus = 'draft' | 'published' | 'archived'

export interface Issue {
  id: string
  title: string
  summary: string | null
  status: IssueStatus
  match_keywords: string[]
  source: string
  created_at: string
  updated_at: string
}

export interface IssueContent {
  id: string
  issue_id: string
  content_id: string
  source: string
  created_at: string
}
