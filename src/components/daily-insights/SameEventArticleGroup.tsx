'use client'

// 지시서 20260827b — 근거기사 "같은 사건 보도" 접기 토글. 상태(펼침/접힘)가 필요해 클라이언트
// 컴포넌트로 분리(서버 컴포넌트에 이벤트 핸들러 직접 달면 500 남 — project_issue_brief_crash 이력).
// 대전제: 숨기지 않는다. 판정이 틀려도 펼치면 others가 전부 그대로 나온다.

import { useState } from 'react'
import { ChevronDown, ExternalLink } from 'lucide-react'
import type { DailyInsightSourceArticle } from '@/lib/daily-insights/types'
import { cn } from '@/lib/utils'

interface SameEventArticleGroupProps {
  representative: DailyInsightSourceArticle
  others: DailyInsightSourceArticle[]
}

function ArticleLine({ article }: { article: DailyInsightSourceArticle }) {
  return (
    <>
      {article.url ? (
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-foreground hover:text-brand-600 hover:underline"
        >
          {article.title}
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      ) : (
        <span className="font-medium text-foreground">{article.title}</span>
      )}
      <span className="ml-1.5 text-muted-foreground">
        ({article.source}
        {article.published_at ? ` · ${article.published_at}` : ''})
      </span>
    </>
  )
}

export default function SameEventArticleGroup({ representative, others }: SameEventArticleGroupProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <li className="text-sm">
      <ArticleLine article={representative} />

      {others.length > 0 && (
        <div className="mt-1">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((prev) => !prev)}
            className="inline-flex items-center gap-1 pl-3 text-xs text-muted-foreground/80 hover:text-brand-600"
          >
            └ 같은 사건 보도 {others.length}건
            <ChevronDown className={cn('h-3 w-3 shrink-0 transition-transform', expanded && 'rotate-180')} />
          </button>

          {expanded && (
            <ul className="mt-1 space-y-1.5 border-l border-border/60 pl-4">
              {others.map((a) => (
                <li key={a.content_id} className="text-sm">
                  <ArticleLine article={a} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}
