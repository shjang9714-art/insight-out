import type { Department } from '@/lib/types'
import type { LensKey } from '@/lib/lens'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export type MyPageTab = 'settings' | 'bookmarks'

export interface ProfileForm {
  name: string
  department: Department
  team: string
  team_name: string
  default_lens: LensKey
}

export interface NewsletterForm {
  is_active: boolean
  newsletter_email: string
}

export interface WatchlistSummaryItem {
  id: string
  company: string
  entity_id: string | null
}

export interface BookmarkWithItem {
  id: string
  content_id: string | null
  youtube_video_id: string | null
  ai_report_id: string | null
  daily_insight_id: string | null
  insight_card_id: string | null
  created_at: string
  contents: {
    id: string
    title: string
    category: string
    original_url: string | null
    published_at: string | null
  } | null
  youtube_videos: {
    id: string
    video_id: string
    title: string
    channel_name: string
    published_at: string | null
  } | null
  ai_reports: {
    id: string
    title: string
    type: string
    published_at: string | null
  } | null
  daily_insights: {
    id: string
    headline: string
    category: string | null
    day_of: string
  } | null
  insight_cards: {
    id: string
    topic: string
    headline: string
    card_headline: string | null
    generated_at: string | null
  } | null
}
