'use client'

import { useState, useEffect } from 'react'
import { FolderPlus, FolderCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import type { Archive } from '@/lib/types'

interface ArchiveButtonProps {
  contentId: string
}

export default function ArchiveButton({ contentId }: ArchiveButtonProps) {
  const [open, setOpen]         = useState(false)
  const [archives, setArchives] = useState<Archive[]>([])
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [newName, setNewName]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [loaded, setLoaded]     = useState(false)

  const supabase = createClient()

  // 패널 열릴 때 처음 한 번만 lazy load
  useEffect(() => {
    if (!open || loaded) return

    const fetchData = async () => {
      setLoading(true)
      const [{ data: myArchives }, { data: existingItems }] = await Promise.all([
        supabase
          .from('archives')
          .select('id, name, description, updated_at, created_at, user_id')
          .order('updated_at', { ascending: false }),
        supabase
          .from('archive_items')
          .select('archive_id')
          .eq('content_id', contentId),
      ])
      setArchives((myArchives ?? []) as Archive[])
      setSavedIds(new Set((existingItems ?? []).map((r) => r.archive_id)))
      setLoaded(true)
      setLoading(false)
    }
    fetchData()
  }, [open, loaded, contentId])

  async function handleAdd(archiveId: string) {
    setLoading(true)
    setError(null)
    const { error: insertErr } = await supabase
      .from('archive_items')
      .insert({ archive_id: archiveId, content_id: contentId, order: 0 })
    if (insertErr) {
      setError('저장에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } else {
      setSavedIds((prev) => new Set([...prev, archiveId]))
      window.dispatchEvent(new CustomEvent('archive:changed'))
    }
    setLoading(false)
  }

  async function handleCreate() {
    if (!newName.trim()) { setError('아카이브 이름을 입력해주세요.'); return }
    setLoading(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('로그인이 필요합니다.'); setLoading(false); return }

    const { data: archive, error: createErr } = await supabase
      .from('archives')
      .insert({ user_id: user.id, name: newName.trim() })
      .select('id, name, description, updated_at, created_at, user_id')
      .single()

    if (createErr || !archive) {
      setError('아카이브 생성에 실패했습니다.')
      setLoading(false)
      return
    }
    setArchives((prev) => [archive as Archive, ...prev])
    await handleAdd(archive.id)  // handleAdd 내에서 archive:changed 발행
    setNewName('')
    setLoading(false)
  }

  const isSaved = savedIds.size > 0

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={`flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
            isSaved
              ? 'border-brand-200 bg-brand-50 text-brand-600 hover:bg-brand-100'
              : 'border-border bg-card text-muted-foreground hover:border-brand-600 hover:text-brand-600'
          }`}
        >
          {isSaved
            ? <FolderCheck className="h-4 w-4" />
            : <FolderPlus className="h-4 w-4" />}
          {isSaved ? '담김' : '아카이빙 담기'}
        </button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>아카이브에 담기</DialogTitle>
        </DialogHeader>

        {/* 아카이브 목록 */}
        <div className="flex flex-col gap-1">
          {loading && !loaded ? (
            <p className="py-4 text-center text-xs text-muted-foreground">불러오는 중...</p>
          ) : archives.length === 0 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">
              아직 아카이브가 없습니다.
            </p>
          ) : (
            archives.map((archive) => {
              const alreadySaved = savedIds.has(archive.id)
              return (
                <button
                  key={archive.id}
                  type="button"
                  disabled={alreadySaved || loading}
                  onClick={() => !alreadySaved && handleAdd(archive.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                    alreadySaved
                      ? 'cursor-default bg-brand-50 text-brand-600'
                      : 'hover:bg-accent disabled:opacity-50'
                  }`}
                >
                  <span className="flex-1 truncate text-sm text-foreground">{archive.name}</span>
                  {alreadySaved ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-brand-600">
                      <FolderCheck className="h-3.5 w-3.5" />
                      담김
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">담기</span>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* 신규 생성 폼 — 항상 노출 */}
        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">새 아카이브 만들고 담기</p>
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate() } }}
              placeholder="아카이브 이름"
              className="h-8 flex-1 text-xs"
              disabled={loading}
            />
            <Button
              type="button"
              size="sm"
              onClick={handleCreate}
              disabled={loading || !newName.trim()}
              className="h-8 shrink-0 text-xs"
            >
              만들고 담기
            </Button>
          </div>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <p className="mt-2 text-xs text-red-500">{error}</p>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" size="sm">완료</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
