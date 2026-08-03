'use client'

import { ExternalLink, FileText } from 'lucide-react'
import CoverImage from '@/components/common/CoverImage'
import { cn } from '@/lib/utils'

export interface EvidenceRow {
  content_id: string
  title: string
  summary_ko: string | null
  original_url: string | null
  thumbnail_url: string | null
  category: string | null
  published_at: string | null
  source_name: string | null
  signal_types: string[]
  max_signal_score: number | null
  signal_count: number
}

interface Props {
  items: EvidenceRow[]
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'short', day: 'numeric',
  })
}

export default function IssueEvidenceSection({ items }: Props) {
  return (
    <section>
      <h2 className="mb-4 text-sm font-semibold text-foreground">
        근거 콘텐츠
        <span className="ml-2 text-xs font-normal text-muted-foreground">{items.length}건</span>
      </h2>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          시그널이 연결된 근거 콘텐츠가 없습니다.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map(item => {
            const href = item.original_url ?? '#'
            const displayAt = item.published_at
            return (
              <li key={item.content_id} className="rounded-xl border border-border bg-card overflow-hidden">
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'flex items-start gap-3 p-4 transition-colors',
                    href !== '#' ? 'hover:bg-accent/40 cursor-pointer' : 'cursor-default'
                  )}
                >
                  {/* 썸네일 */}
                  <div className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                    <CoverImage
                      src={item.thumbnail_url}
                      alt=""
                      className="w-full h-full object-cover"
                      fallback={<FileText className="h-6 w-6 text-muted-foreground/40" />}
                    />
                  </div>

                  {/* 본문 */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {/* 분류 배지 */}
                    {item.signal_types.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {item.signal_types.map(sig => (
                          <span
                            key={sig}
                            className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-blue-700"
                          >
                            {sig}
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">
                      {item.title}
                    </p>

                    {item.summary_ko && (
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                        {item.summary_ko}
                      </p>
                    )}

                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                      {item.source_name && <span>{item.source_name}</span>}
                      {item.source_name && displayAt && <span>·</span>}
                      {displayAt && <span>{formatDate(displayAt)}</span>}
                      {href !== '#' && (
                        <ExternalLink className="ml-auto h-3 w-3 shrink-0 text-muted-foreground/50" />
                      )}
                    </div>
                  </div>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
