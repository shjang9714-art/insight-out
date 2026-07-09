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
import WatchlistManager from './WatchlistManager'

interface Props {
  /** 트리거 커스텀 — 없으면 기본 "관심기업 설정" 버튼 */
  trigger?: ReactNode
  /** 추가·삭제 시 호출 — 호출부(서버 컴포넌트) 갱신용 */
  onChange?: () => void
}

/** 관심기업 검색·추가·삭제 공유 모달(225) — 마이페이지·기업동향 인탭에서 재사용 */
export default function WatchlistSettingsModal({ trigger, onChange }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" size="sm">
            <Building2 className="mr-1.5 h-3.5 w-3.5" />
            관심기업 설정
          </Button>
        )}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>관심기업 설정</DialogTitle>
          <DialogDescription>
            검색해서 추가하면 기업동향·AI 인사이트에서 더 정확히 모아 보여드립니다.
          </DialogDescription>
        </DialogHeader>

        <WatchlistManager onChange={onChange} />

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" size="sm">완료</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
