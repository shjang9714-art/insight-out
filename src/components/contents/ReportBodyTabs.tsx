'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import PdfViewer from '@/components/contents/PdfViewer'
import ReportMarkdown from '@/components/reports/ReportMarkdown'

type Tab = 'markdown' | 'viewer' | 'text'

interface ReportBodyTabsProps {
  contentId: string
  signedUrl: string
  downloadUrl: string
  downloadFileName: string
  /** body_original을 문단 정리만 한 평문(변환·가공 없음, 307 §3-3) */
  textBody: string | null
  /** 어드민이 수동으로 다듬어 넣은 본문(212) — 있으면 죽은 경로였던 걸 기본 탭으로 살린다(307 §3-5) */
  markdownBody: string | null
}

/**
 * 리포트 본문 탭(307) — [본문](있을 때만) / [원문 보기] / [텍스트로 보기](body_original 있을 때만).
 * 변환은 하지 않는다: 텍스트 탭은 원문 그대로, 본문 탭은 어드민이 수동으로 넣은 것만 보여준다.
 */
export default function ReportBodyTabs({
  contentId,
  signedUrl,
  downloadUrl,
  downloadFileName,
  textBody,
  markdownBody,
}: ReportBodyTabsProps) {
  const tabs: { key: Tab; label: string }[] = [
    ...(markdownBody ? [{ key: 'markdown' as const, label: '본문' }] : []),
    { key: 'viewer', label: '원문 보기' },
    ...(!markdownBody && textBody ? [{ key: 'text' as const, label: '텍스트로 보기' }] : []),
  ]

  const [tab, setTab] = useState<Tab>(markdownBody ? 'markdown' : 'viewer')

  return (
    <div>
      <div className="mb-4 flex items-center gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === t.key
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'markdown' && markdownBody && <ReportMarkdown>{markdownBody}</ReportMarkdown>}

      {tab === 'viewer' && (
        <PdfViewer
          contentId={contentId}
          initialUrl={signedUrl}
          downloadUrl={downloadUrl}
          downloadFileName={downloadFileName}
        />
      )}

      {tab === 'text' && textBody && (
        <div className="max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {textBody}
        </div>
      )}
    </div>
  )
}
