'use client'

import ContentRow from '@/components/dashboard/ContentRow'
import SearchResultCard from '@/components/dashboard/SearchResultCard'
import { tagsOf } from '@/lib/contents/excerpt'
import { SEARCH_FILTER_DEFS } from '@/lib/search/search-filters'
import type { ContentSearchRow, UnifiedResult } from '@/lib/search/use-unified-search'

function getKeywords(item: ContentSearchRow): string[] {
  return item.content_keywords.map(ck => ck.keywords?.name).filter((name): name is string => Boolean(name))
}

function getServices(item: ContentSearchRow): string[] {
  return item.content_services.map(cs => cs.services?.name).filter((name): name is string => Boolean(name))
}

export default function SearchResultsList({ results }: { results: UnifiedResult[] }) {
  return (
    <div className="space-y-2">
      {results.map(item => {
        if (item.source === 'content' && item.content) {
          const content = item.content
          return <ContentRow key={item.key} id={content.id} title={content.title} summaryKo={content.summary_ko} bodyOriginal={content.body_original} category={content.category} publishedAt={content.published_at} originalUrl={content.original_url} filePath={content.file_path} isEditorPick={content.is_editor_pick} author={content.author} sourceName={content.sources?.name ?? null} keywords={tagsOf(getKeywords(content), content.category, getServices(content))} />
        }
        if (item.source === 'daily_insights' && item.insight) {
          const insight = item.insight
          const def = SEARCH_FILTER_DEFS.find(d => d.key === 'insight')!
          return <SearchResultCard key={item.key} href={`/dashboard/daily-insights/${insight.id}`} title={insight.headline} excerpt={insight.summary_ko} publishedAt={insight.day_of} typeBadge={{ label: def.label, className: def.badgeClass }} />
        }
        if (item.source === 'issues' && item.issue) {
          const issue = item.issue
          const def = SEARCH_FILTER_DEFS.find(d => d.key === 'issue')!
          return <SearchResultCard key={item.key} href={`/dashboard/issues/${issue.id}`} title={issue.title} excerpt={issue.summary} publishedAt={issue.created_at} typeBadge={{ label: def.label, className: def.badgeClass }} />
        }
        return null
      })}
    </div>
  )
}
