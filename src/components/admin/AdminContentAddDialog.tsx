'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

const ContentAddTabs = dynamic(() => import('@/components/admin/ContentAddTabs'), { ssr: false })

export default function AdminContentAddDialog() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <Plus className="h-4 w-4" />
          콘텐츠 추가
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle>콘텐츠 추가</DialogTitle>
          <DialogDescription>파일 업로드, 텍스트 붙여넣기, URL 가져오기로 콘텐츠를 등록합니다.</DialogDescription>
        </DialogHeader>
        {isOpen ? <ContentAddTabs /> : null}
      </DialogContent>
    </Dialog>
  )
}
