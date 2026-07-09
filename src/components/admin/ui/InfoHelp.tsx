'use client'

import { Info } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { AdminHelpCopy } from '@/lib/admin/help'
import { cn } from '@/lib/utils'

interface Props {
  copy: AdminHelpCopy
  className?: string
}

/** 어드민 섹션/카드 헤더 옆에 붙이는 정보 아이콘 — 클릭 시 무엇/서비스 연계/운영을 팝오버로 보여준다. */
export default function InfoHelp({ copy, className }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${copy.title} 도움말`}
          className={cn(
            'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring',
            className,
          )}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-72 text-xs leading-relaxed">
        <p className="mb-2 text-sm font-semibold text-foreground">{copy.title}</p>
        <dl className="space-y-2">
          <div>
            <dt className="font-medium text-foreground">무엇</dt>
            <dd className="text-muted-foreground">{copy.what}</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">서비스 연계</dt>
            <dd className="text-muted-foreground">{copy.service}</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">운영</dt>
            <dd className="text-muted-foreground">{copy.ops}</dd>
          </div>
        </dl>
      </PopoverContent>
    </Popover>
  )
}
