'use client'

import { useState } from 'react'
import { Volume2, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import MorningBriefingPlayer from '@/components/dashboard/MorningBriefingPlayer'
import { cn } from '@/lib/utils'

interface Briefing {
  id: string
  briefing_date: string
  title: string | null
  script: string | null
  audio_url: string | null
  audio_duration_seconds: number | null
  voice?: string | null
  status?: string
}

interface Props {
  briefings: Briefing[]
}

const DATE_FORMATTER = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
})

export default function BriefingArchive({ briefings }: Props) {
  const [selectedId, setSelectedId] = useState<string | undefined>(
    briefings[0]?.id
  )

  if (briefings.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        아직 공개된 브리핑이 없습니다.
      </div>
    )
  }

  const selected = briefings.find((b) => b.id === selectedId) ?? briefings[0]

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
      {/* 목록 */}
      <div className="space-y-2">
        {briefings.map((briefing) => {
          const isSelected = briefing.id === selectedId
          const isArchived = briefing.status === 'archived'

          return (
            <button
              key={briefing.id}
              type="button"
              onClick={() => setSelectedId(briefing.id)}
              className={cn(
                'w-full rounded-xl border px-4 py-3.5 text-left transition-colors',
                isSelected
                  ? 'border-brand-600 bg-brand-50 dark:bg-brand-600/10'
                  : 'border-border bg-card hover:border-brand-600/40 hover:bg-accent'
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {DATE_FORMATTER.format(new Date(briefing.briefing_date + 'T00:00:00'))}
                </span>
                <Badge
                  className={cn(
                    'text-[10px] font-medium',
                    isArchived
                      ? 'bg-muted text-muted-foreground hover:bg-muted'
                      : 'bg-brand-600 text-white hover:bg-brand-600'
                  )}
                >
                  {isArchived ? '보관' : '공개'}
                </Badge>
                {briefing.audio_url ? (
                  <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>
              <p className={cn(
                'mt-1 text-sm font-medium',
                isSelected ? 'text-brand-600' : 'text-foreground'
              )}>
                {briefing.title ?? '제목 없음'}
              </p>
              {briefing.script && (
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                  {briefing.script}
                </p>
              )}
            </button>
          )
        })}
      </div>

      {/* 플레이어 */}
      <div className="md:sticky md:top-20 md:self-start">
        <MorningBriefingPlayer briefing={selected} />
      </div>
    </div>
  )
}
