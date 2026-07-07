'use client'

import { useState } from 'react'
import { Loader2, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import TextPasteForm, { type FormState } from '@/components/admin/TextPasteForm'

export default function UrlImportForm() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [extracted, setExtracted] = useState<Partial<FormState> | null>(null)

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) { setError('URL을 입력해주세요.'); return }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '가져오기에 실패했습니다.')
      setExtracted(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '가져오기 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  if (extracted) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm">
          <span className="truncate text-muted-foreground">
            가져온 원문: <span className="text-foreground">{extracted.originalUrl}</span>
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => { setExtracted(null); setUrl('') }}
          >
            다시 가져오기
          </Button>
        </div>
        <TextPasteForm key={extracted.originalUrl} initialForm={extracted} />
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground">URL 가져오기</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleImport} className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="import-url">기사 URL</Label>
            <div className="flex gap-2">
              <Input
                id="import-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="flex-1"
              />
              <Button type="submit" disabled={loading} className="shrink-0">
                {loading
                  ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />가져오는 중...</>
                  : <><Download className="mr-1.5 h-4 w-4" />가져오기</>
                }
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            기사 URL을 넣으면 제목·본문·발행 정보를 자동으로 가져옵니다. 가져온 뒤 수정할 수 있어요.
          </p>
          {error && (
            <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
