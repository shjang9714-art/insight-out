'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'

const DEFAULT_MIN_BODY_LENGTH = 250

export default function CrawlSettings() {
  const [minBodyLength, setMinBodyLength] = useState(DEFAULT_MIN_BODY_LENGTH)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/crawl-settings')
      .then((res) => res.json())
      .then((data: { min_body_length?: number }) => {
        if (cancelled) return
        if (typeof data.min_body_length === 'number') setMinBodyLength(data.min_body_length)
      })
      .catch(() => { /* graceful — 기본값 유지 */ })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/admin/crawl-settings', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ min_body_length: minBodyLength }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? '저장에 실패했습니다.')
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <p className="admin-card-title text-foreground">수집 필터</p>
      <p className="admin-caption mt-1 max-w-lg text-muted-foreground">
        이 글자수 미만 본문의 기사는 수집하지 않습니다.
      </p>

      {error && (
        <div className="mt-3">
          <AdminErrorBox onDismiss={() => setError(null)}>{error}</AdminErrorBox>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="min-body-length">본문 최소 길이(자)</Label>
          <Input
            id="min-body-length"
            type="number"
            min={50}
            max={5000}
            value={minBodyLength}
            disabled={isLoading}
            onChange={(e) => { setMinBodyLength(Number(e.target.value)); setSaved(false) }}
            className="w-32"
          />
        </div>
        <Button type="button" size="sm" disabled={isLoading || isSaving} onClick={handleSave}>
          {isSaving ? '저장 중...' : '저장'}
        </Button>
        {saved && (
          <span className="admin-caption text-positive">저장됐습니다.</span>
        )}
      </div>
    </div>
  )
}
