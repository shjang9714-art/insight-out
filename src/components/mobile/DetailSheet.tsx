'use client'

import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { BellPlus, FilePlus2, Share2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface DetailSheetProps {
  children: ReactNode
  titleFallback: string
}

const actions = [
  { label: '추적', icon: BellPlus },
  { label: '보고서로', icon: FilePlus2 },
  { label: '공유', icon: Share2 },
]

export default function DetailSheet({ children, titleFallback }: DetailSheetProps) {
  const router = useRouter()

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => {
      if (!open) router.back()
    }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={[
            'fixed inset-0 z-50 bg-black/50',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
          ].join(' ')}
        />
        <DialogPrimitive.Content
          className={[
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col overflow-hidden',
            'rounded-t-2xl border border-border bg-background shadow-2xl focus:outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
            'md:inset-auto md:left-1/2 md:top-1/2 md:w-[calc(100%-2rem)] md:max-w-2xl',
            'md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl',
            'md:data-[state=open]:fade-in-0 md:data-[state=closed]:fade-out-0',
            'md:data-[state=open]:zoom-in-95 md:data-[state=closed]:zoom-out-95',
          ].join(' ')}
        >
          <div className="flex shrink-0 flex-col border-b border-border bg-background">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30 md:hidden" />
            <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <DialogPrimitive.Title className="truncate text-sm font-semibold text-foreground">
                {titleFallback}
              </DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="상세 닫기">
                  <X className="h-4 w-4" />
                </Button>
              </DialogPrimitive.Close>
            </div>
            <DialogPrimitive.Description className="sr-only">
              선택한 항목의 상세 정보를 보여주는 화면입니다.
            </DialogPrimitive.Description>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {children}
          </div>

          <div className="grid shrink-0 grid-cols-3 gap-2 border-t border-border bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-5 md:pb-3">
            {actions.map(({ label, icon: Icon }) => (
              <Button
                key={label}
                type="button"
                variant="outline"
                size="sm"
                disabled
                title="준비 중"
                className="gap-1.5"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Button>
            ))}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
