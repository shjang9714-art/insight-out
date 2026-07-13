'use client'

import { useState, type ReactNode } from 'react'
import { Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import ServiceSelectionGrid from './ServiceSelectionGrid'
import type { SaveStatus, ServiceOption } from './types'

interface Props {
  services: ServiceOption[]
  selectedServiceIds: string[]
  status: SaveStatus
  error: string | null
  onSave: (nextIds: string[]) => Promise<boolean>
  trigger?: ReactNode
}

export default function ServiceSettingsModal({
  services,
  selectedServiceIds,
  status,
  error,
  onSave,
  trigger,
}: Props) {
  const [open, setOpen] = useState(false)
  const [draftIds, setDraftIds] = useState<string[]>(selectedServiceIds)

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setDraftIds(selectedServiceIds)
    setOpen(nextOpen)
  }

  const handleSave = async () => {
    const ok = await onSave(draftIds)
    if (ok) setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" size="sm">
            <Building2 className="mr-1.5 h-3.5 w-3.5" />
            서비스 설정
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>담당 서비스 설정</DialogTitle>
          <DialogDescription>
            담당하거나 관심 있는 서비스를 선택하세요. 콘텐츠와 홈 화면에서 이 기준을 우선 반영합니다.
          </DialogDescription>
        </DialogHeader>

        <ServiceSelectionGrid
          items={services}
          selectedIds={draftIds}
          onChange={setDraftIds}
          compact
        />

        {error && <p className="text-xs text-red-500">{error}</p>}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" size="sm">취소</Button>
          </DialogClose>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={status === 'saving'}
          >
            {status === 'saving' ? '저장 중...' : status === 'saved' ? '저장되었습니다' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
