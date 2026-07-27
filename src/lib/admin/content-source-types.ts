import type { SourceType } from '@/lib/types'

// 어드민 콘텐츠 카테고리 → 목록·소스 관리에서 사용하는 소스 유형.
export const CATEGORY_SOURCE_TYPE: Partial<Record<string, SourceType>> = {
  '뉴스': 'news_site',
  '외부리포트': 'report_publisher',
  '웹인사이트': 'web_insight',
  '유튜브': 'youtube_channel',
}
