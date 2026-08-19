'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { ClipboardList } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

const RequestsBoard = dynamic(() => import('@/components/admin/RequestsBoard'), { ssr: false })

export default function AdminRequestsDialog() {
  const [isOpen, setIsOpen] = useState(false)
  const [openRequestCount, setOpenRequestCount] = useState(0)

  useEffect(() => {
    const run = async () => {
      try {
        const response = await fetch('/api/admin/requests/count')
        if (!response.ok) return
        const data = await response.json() as { count: number }
        setOpenRequestCount(data.count ?? 0)
      } catch {
        // 비차단 배지로, 조회 실패 시 숨긴다.
      }
    }
    void run()
  }, [])

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`운영 게시판 열기${openRequestCount > 0 ? `, 미완료 ${openRequestCount}건` : ''}`}
          title="운영 게시판"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ClipboardList className="h-4 w-4" />
          {openRequestCount > 0 && (
            <span className="admin-caption absolute -right-2 -top-2 min-w-5 rounded-full bg-risk px-1.5 py-0.5 text-center font-medium text-white">
              {openRequestCount}
            </span>
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle>운영 게시판</DialogTitle>
          <DialogDescription>운영 요청, 작업 메모, 공지, 핸드오프를 관리합니다.</DialogDescription>
        </DialogHeader>
        {isOpen ? <RequestsBoard /> : null}
      </DialogContent>
    </Dialog>
  )
}
