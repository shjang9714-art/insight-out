import type { Department } from '@/lib/types'
import type { LensKey } from '@/lib/lens'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export type MyPageTab = 'settings' | 'bookmarks' | 'archives'

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
}

export interface ArchiveWithItems {
  id: string
  name: string
  description: string | null
  created_at: string
  items: {
    content_id: string | null
    youtube_video_id: string | null
    ai_report_id: string | null
    added_at: string
    contents: { id: string; title: string; category: string; original_url: string | null } | null
    ai_reports: { id: string; title: string; type: string; published_at: string | null } | null
  }[]
}
