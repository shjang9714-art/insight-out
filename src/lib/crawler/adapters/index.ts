import type { SourceAdapter } from '../types'
import type { SourceType } from '@/lib/types'
import newsSiteAdapter from './news-site'

/**
 * 소스 타입에 맞는 어댑터 반환.
 * 미구현 타입은 null 반환 — orchestrator가 skip 처리.
 */
export function getAdapter(type: SourceType): SourceAdapter | null {
  switch (type) {
    case 'news_site':
      return newsSiteAdapter
    // report_publisher · opinion_channel · newsletter · youtube_channel
    // → Phase 3-A 이후 구현 예정
    default:
      return null
  }
}
