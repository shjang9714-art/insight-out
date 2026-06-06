'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2, Search, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import {
  CONTENT_CATEGORY_LABEL,
  type ContentCategory,
  type ContentStatus,
} from '@/lib/types'
import { cn } from '@/lib/utils'

interface AdminContentRow {
  id: string
  title: string
  category: ContentCategory
  status: ContentStatus
  collected_at: string
  sources: { name: string } | null
}

const CONTENT_STATUSES: ContentStatus[] = ['published', 'pending', 'rejected']

const STATUS_STYLE: Record<ContentStatus, { label: string; className: string }> = {
  published: {
    label: '게시',
    className: 'border-green-100 bg-green-50 text-green-700',
  },
  pending: {
    label: '보류',
    className: 'border-yellow-100 bg-yellow-50 text-yellow-700',
  },
  rejected: {
    label: '반려',
    className: 'border-red-100 bg-red-50 text-red-700',
  },
}

function formatKst(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AdminContentManager() {
  const supabase = createClient()
  const [contents, setContents] = useState<AdminContentRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [workingId, setWorkingId] = useState<string | null>(null)

  useEffect(() => {
    const loadContents = async () => {
      const { data, error: loadError } = await supabase
        .from('contents')
        .select('id, title, category, status, collected_at, sources(name)')
        .order('collected_at', { ascending: false })
        .limit(100)

      if (loadError) {
        setError(`콘텐츠 목록을 불러오지 못했습니다: ${loadError.message}`)
      } else {
        setContents((data ?? []) as unknown as AdminContentRow[])
      }
      setIsLoading(false)
    }

    loadContents()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredContents = contents.filter((content) => {
    const matchesCategory = category === 'all' || content.category === category
    const matchesStatus = status === 'all' || content.status === status
    const matchesSearch = content.title
      .toLocaleLowerCase('ko-KR')
      .includes(searchTerm.trim().toLocaleLowerCase('ko-KR'))
    return matchesCategory && matchesStatus && matchesSearch
  })

  const handleStatusChange = async (
    content: AdminContentRow,
    nextStatus: ContentStatus
  ) => {
    setWorkingId(content.id)
    setError(null)
    const { error: updateError } = await supabase
      .from('contents')
      .update({ status: nextStatus })
      .eq('id', content.id)

    if (updateError) {
      setError(`상태 변경에 실패했습니다: ${updateError.message}`)
    } else {
      setContents((previous) =>
        previous.map((item) =>
          item.id === content.id ? { ...item, status: nextStatus } : item
        )
      )
    }
    setWorkingId(null)
  }

  const handleDelete = async (content: AdminContentRow) => {
    if (!window.confirm(`"${content.title}" 콘텐츠를 삭제하시겠습니까?`)) return

    setWorkingId(content.id)
    setError(null)
    const { error: deleteError } = await supabase
      .from('contents')
      .delete()
      .eq('id', content.id)

    if (deleteError) {
      setError(`콘텐츠 삭제에 실패했습니다: ${deleteError.message}`)
    } else {
      setContents((previous) => previous.filter((item) => item.id !== content.id))
    }
    setWorkingId(null)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        콘텐츠를 불러오는 중입니다.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-start justify-between rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-4 shrink-0 underline"
          >
            닫기
          </button>
        </div>
      )}

      <div className="grid gap-3 rounded-xl border border-gray-100 bg-white p-4 md:grid-cols-[1fr_180px_180px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="제목 검색"
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="카테고리" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 카테고리</SelectItem>
            {Object.entries(CONTENT_CATEGORY_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            {CONTENT_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {STATUS_STYLE[value].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-gray-500">
        최근 콘텐츠 100건 중 {filteredContents.length}건을 표시합니다.
      </p>

      {filteredContents.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          조건에 맞는 콘텐츠가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold text-gray-500">
                <th className="px-4 py-3">제목</th>
                <th className="px-4 py-3">카테고리</th>
                <th className="px-4 py-3">소스</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">수집일 (KST)</th>
                <th className="px-4 py-3 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredContents.map((content) => {
                const isWorking = workingId === content.id
                const statusStyle = STATUS_STYLE[content.status]
                return (
                  <tr key={content.id} className="hover:bg-gray-50">
                    <td className="max-w-md px-4 py-3 font-medium text-gray-900">
                      <span className="line-clamp-2">{content.title}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                      {CONTENT_CATEGORY_LABEL[content.category]}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                      {content.sources?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                          statusStyle.className
                        )}
                      >
                        {statusStyle.label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                      {formatKst(content.collected_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {content.status !== 'published' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isWorking}
                            onClick={() => handleStatusChange(content, 'published')}
                            className="text-green-700"
                          >
                            <Check className="h-3.5 w-3.5" />
                            승인
                          </Button>
                        )}
                        {content.status !== 'rejected' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isWorking}
                            onClick={() => handleStatusChange(content, 'rejected')}
                            className="text-red-600"
                          >
                            <X className="h-3.5 w-3.5" />
                            반려
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          disabled={isWorking}
                          onClick={() => handleDelete(content)}
                          aria-label={`${content.title} 삭제`}
                          className="text-gray-400 hover:text-red-600"
                        >
                          {isWorking ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
