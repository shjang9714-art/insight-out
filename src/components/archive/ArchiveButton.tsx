'use client'

import { useState, useEffect, useRef } from 'react'
import { FolderPlus, FolderCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Archive } from '@/lib/types'

interface ArchiveButtonProps {
  contentId: string
}

export default function ArchiveButton({ contentId }: ArchiveButtonProps) {
  const [open, setOpen]         = useState(false)
  const [archives, setArchives] = useState<Archive[]>([])
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [newName, setNewName]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [loaded, setLoaded]     = useState(false)

  const panelRef = useRef<HTMLDivElement>(null)
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

  // 패널 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

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
    await handleAdd(archive.id)
    setCreating(false)
    setNewName('')
    setLoading(false)
  }

  const isSaved = savedIds.size > 0

  return (
    <div className="relative" ref={panelRef}>
      {/* 트리거 버튼 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
          isSaved
            ? 'border-brand-200 bg-brand-50 text-brand-600 hover:bg-brand-100'
            : 'border-gray-200 bg-white text-gray-600 hover:border-brand-600 hover:text-brand-600'
        }`}
      >
        {isSaved
          ? <FolderCheck className="h-4 w-4" />
          : <FolderPlus className="h-4 w-4" />}
        {isSaved ? '담김' : '아카이빙 담기'}
      </button>

      {/* 드롭다운 패널 */}
      {open && (
        <div className="absolute right-0 top-11 z-30 w-60 rounded-xl border border-gray-100 bg-white p-3 shadow-lg">
          {loading && !loaded ? (
            <p className="py-4 text-center text-xs text-gray-400">불러오는 중...</p>
          ) : (
            <>
              {/* 아카이브 목록 */}
              <div className="mb-2 flex flex-col gap-1">
                {archives.length === 0 && !creating && (
                  <p className="py-2 text-center text-xs text-gray-400">
                    아직 아카이브가 없습니다.
                  </p>
                )}
                {archives.map((archive) => {
                  const alreadySaved = savedIds.has(archive.id)
                  return (
                    <div
                      key={archive.id}
                      className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50"
                    >
                      <span className="flex-1 truncate text-sm text-gray-800">{archive.name}</span>
                      <button
                        type="button"
                        disabled={alreadySaved || loading}
                        onClick={() => handleAdd(archive.id)}
                        className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                          alreadySaved
                            ? 'cursor-default text-brand-600'
                            : 'text-gray-500 hover:bg-brand-50 hover:text-brand-600 disabled:opacity-50'
                        }`}
                      >
                        {alreadySaved ? '담겼음' : '담기'}
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* 신규 아카이브 생성 폼 */}
              {creating ? (
                <div className="flex flex-col gap-1.5 border-t border-gray-100 pt-2">
                  <Input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate() } }}
                    placeholder="아카이브 이름"
                    className="h-7 text-xs"
                  />
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleCreate}
                      disabled={loading}
                      className="h-7 flex-1 text-xs"
                    >
                      확인
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => { setCreating(false); setNewName(''); setError(null) }}
                      className="h-7 text-xs"
                    >
                      취소
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setCreating(true); setError(null) }}
                  className="mt-1 w-full rounded-lg border-t border-gray-100 pt-2 text-left text-xs text-brand-600 hover:underline"
                >
                  + 새 아카이브 만들기
                </button>
              )}

              {/* 에러 메시지 */}
              {error && (
                <p className="mt-1.5 text-xs text-red-500">{error}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
