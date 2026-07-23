'use client'

import { useCallback, useEffect, useState } from 'react'
import { Search, Loader2, CheckSquare, Square } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface IssueRow {
  id: string
  title: string
  summary: string | null
}

interface ContentRow {
  id: string
  title: string
  category: string | null
}

interface ReportSourcePickerProps {
  selectedIssueIds: Set<string>
  onChangeIssueIds: (ids: Set<string>) => void
  onIssuePicked?: (issue: { id: string; title: string }) => void
  selectedContentIds: Set<string>
  onChangeContentIds: (ids: Set<string>) => void
}

/**
 * 전략보고서 생성·재생성 폼의 근거(출처) 선택기(276) — 이슈 목록 + 콘텐츠 검색.
 * dashboard/reports/new(구 유저 워크벤치)의 소스 선택 UI를 어드민용으로 축약 재사용.
 */
export default function ReportSourcePicker({
  selectedIssueIds, onChangeIssueIds, onIssuePicked, selectedContentIds, onChangeContentIds,
}: ReportSourcePickerProps) {
  const [issues, setIssues] = useState<IssueRow[]>([])
  const [contentSearch, setContentSearch] = useState('')
  const [contentResults, setContentResults] = useState<ContentRow[]>([])
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('issues')
      .select('id, title, summary')
      .in('status', ['published'])
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setIssues((data ?? []) as IssueRow[]))
  }, [])

  const searchContents = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setContentResults([])
      return
    }
    setIsSearching(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('contents')
      .select('id, title, category')
      .ilike('title', `%${q.trim()}%`)
      .eq('status', 'published')
      .order('collected_at', { ascending: false })
      .limit(20)
    setContentResults((data ?? []) as ContentRow[])
    setIsSearching(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => searchContents(contentSearch), 350)
    return () => clearTimeout(t)
  }, [contentSearch, searchContents])

  const toggleIssue = (issue: IssueRow) => {
    const next = new Set(selectedIssueIds)
    if (next.has(issue.id)) {
      next.delete(issue.id)
    } else {
      next.add(issue.id)
      onIssuePicked?.({ id: issue.id, title: issue.title })
    }
    onChangeIssueIds(next)
  }

  const toggleContent = (id: string) => {
    const next = new Set(selectedContentIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    onChangeContentIds(next)
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-medium text-foreground">이슈 선택</p>
        {issues.length === 0 ? (
          <p className="text-xs text-muted-foreground">등록된 이슈가 없습니다.</p>
        ) : (
          <div className="max-h-40 overflow-y-auto rounded-lg border border-border divide-y divide-border">
            {issues.map((iss) => {
              const checked = selectedIssueIds.has(iss.id)
              return (
                <button
                  key={iss.id}
                  type="button"
                  onClick={() => toggleIssue(iss)}
                  className={cn(
                    'flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/40',
                    checked && 'bg-brand-600/5',
                  )}
                >
                  {checked
                    ? <CheckSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />
                    : <Square className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />}
                  <span className="text-xs text-foreground leading-snug line-clamp-1">{iss.title}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-foreground">콘텐츠 검색(선택)</p>
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <input
            type="text"
            value={contentSearch}
            onChange={(e) => setContentSearch(e.target.value)}
            placeholder="콘텐츠 제목으로 검색…"
            className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
          />
          {isSearching && (
            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground/50" />
          )}
        </div>
        {contentResults.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-lg border border-border divide-y divide-border">
            {contentResults.map((c) => {
              const checked = selectedContentIds.has(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleContent(c.id)}
                  className={cn(
                    'flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/40',
                    checked && 'bg-brand-600/5',
                  )}
                >
                  {checked
                    ? <CheckSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />
                    : <Square className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />}
                  <span className="text-xs text-foreground leading-snug line-clamp-1">{c.title}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {(selectedIssueIds.size > 0 || selectedContentIds.size > 0) && (
        <p className="text-[11px] text-muted-foreground">
          선택됨 · 이슈 {selectedIssueIds.size} · 콘텐츠 {selectedContentIds.size}
        </p>
      )}
    </div>
  )
}
