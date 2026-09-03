'use client'

import ContentRow from '@/components/dashboard/ContentRow'
import SearchResultCard from '@/components/dashboard/SearchResultCard'
import { tagsOf2 } from '@/lib/contents/excerpt'
import { SEARCH_FILTER_DEFS } from '@/lib/search/search-filters'
import type { UnifiedResult } from '@/lib/search/use-unified-search'

/** UnifiedResult 한 항목을 카드로 렌더. highlightQuery를 주면 제목에서 일치 부분을
 * 강조한다. SearchResultsPanel.tsx(팝업이 아닌 /dashboard/search 전체 페이지의 결과 목록,
 * 2026-08-09b 후속 개편)가 이 함수로 종류 무관 병합/단일 종류 목록을 그린다. */
export function renderSearchResultItem(item: UnifiedResult, highlightQuery?: string) {
  if (item.source === 'content' && item.content) {
    const content = item.content
    // 514 — content_keywords(keywords.name) 조인 대신 다른 목록 화면과 같은
    // tagsOf2(matched_groups + matched_keywords) 경로로 통일.
    const keywords = tagsOf2(content.matched_groups ?? [], content.matched_keywords ?? [], content.category)
    return <ContentRow key={item.key} id={content.id} title={content.title} summaryKo={content.summary_ko} bodyOriginal={content.excerpt} category={content.category} publishedAt={content.published_at} originalUrl={content.original_url} filePath={content.file_path} isEditorPick={content.is_editor_pick} author={content.author} sourceName={content.sources?.name ?? null} keywords={keywords} highlightQuery={highlightQuery} />
  }
  if (item.source === 'daily_insights' && item.insight) {
    const insight = item.insight
    const def = SEARCH_FILTER_DEFS.find(d => d.key === 'insight')!
    return <SearchResultCard key={item.key} href={`/dashboard/daily-insights/${insight.id}`} title={insight.headline} excerpt={insight.summary_ko} publishedAt={insight.day_of} typeBadge={{ label: def.label, className: def.badgeClass }} highlightQuery={highlightQuery} />
  }
  // source === 'issues' 분기는 없음 — '이슈 브리핑' 버킷을 검색 종류 목록에서 제외했고
  // (search-filters.ts, 2026-08-10) SEARCH_SECTION_ORDER에 그 def가 없어 fetchSection이
  // 절대 source:'issues' 결과를 반환하지 않는다. issues 테이블·fetchIssues 자체는 그대로 둠.
  if (item.source === 'entities' && item.entity) {
    const entity = item.entity
    const def = SEARCH_FILTER_DEFS.find(d => d.key === 'company')!
    const excerpt = entity.description ?? `연결된 기사 ${entity.linkedCount}건`
    return <SearchResultCard key={item.key} href={`/dashboard/entities/${entity.id}`} title={entity.canonical_name} excerpt={excerpt} publishedAt={entity.latestPublishedAt} typeBadge={{ label: def.label, className: def.badgeClass }} highlightQuery={highlightQuery} />
  }
  if (item.source === 'keywords' && item.keyword) {
    const keyword = item.keyword
    const def = SEARCH_FILTER_DEFS.find(d => d.key === 'keyword')!
    return <SearchResultCard key={item.key} href={`/dashboard/keywords/${encodeURIComponent(keyword.name)}`} title={keyword.name} excerpt={`연결된 기사 ${keyword.linkedCount}건`} publishedAt={keyword.latestPublishedAt} typeBadge={{ label: def.label, className: def.badgeClass }} highlightQuery={highlightQuery} />
  }
  return null
}
