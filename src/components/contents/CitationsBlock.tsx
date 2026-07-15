'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { CitationItem, ContentCitations } from '@/lib/contents/citations'

const MAX_VISIBLE = 3

function Section({ icon, label, items }: { icon: string; label: string; items: CitationItem[] }) {
  const [expanded, setExpanded] = useState(false)
  if (items.length === 0) return null

  const visible = expanded ? items : items.slice(0, MAX_VISIBLE)
  const hiddenCount = items.length - visible.length

  return (
    <div className="space-y-1.5">
      {visible.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          prefetch={false}
          className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm transition-colors hover:border-brand-600/40 hover:bg-accent/50"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="shrink-0">{icon}</span>
            <span className="shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
            <span className="truncate text-foreground">{item.label}</span>
          </span>
          <span className="shrink-0 text-muted-foreground">→</span>
        </Link>
      ))}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="pl-1 text-xs text-muted-foreground underline decoration-dotted hover:text-foreground"
        >
          더 보기 ({hiddenCount}건)
        </button>
      )}
    </div>
  )
}

/**
 * "이 기사를 인용한 리포트·인사이트"(313) — 역참조 4종. 전부 비어 있으면 렌더하지 않는다.
 * 부제문 없음(David 확정) — 제목 하나로 뜻이 다 전달된다.
 */
export default function CitationsBlock({ citations }: { citations: ContentCitations }) {
  const total =
    citations.reports.length + citations.issues.length + citations.insights.length + citations.briefings.length
  if (total === 0) return null

  return (
    <section className="mt-10 border-t border-border pt-8">
      <h2 className="mb-3 text-sm font-semibold text-foreground">이 기사를 인용한 리포트·인사이트</h2>
      <div className="space-y-3">
        <Section icon="📄" label="AI 리포트" items={citations.reports} />
        <Section icon="💡" label="AI 인사이트" items={citations.issues} />
        <Section icon="🏢" label="기업 인사이트" items={citations.insights} />
        <Section icon="🎙" label="모닝브리핑" items={citations.briefings} />
      </div>
    </section>
  )
}
