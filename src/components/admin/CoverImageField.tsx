'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ImageIcon, Loader2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import BrandedCover from '@/components/dashboard/BrandedCover'
import type { ContentCategory } from '@/lib/types'
import { compressImageToLimit } from '@/lib/images/compress-image'

const MAX_BYTES = 2 * 1024 * 1024

interface CoverImageFieldProps {
  category: ContentCategory
  title: string
  sourceName: string | null
  /** 사용자가 새로 선택한 파일. 없으면 null. */
  value: File | null
  onChange: (file: File | null) => void
  /** 크롤/가져오기로 얻은 초기 미리보기 URL(예: og:image). 사용자가 파일을 고르면 우선순위 밀림. */
  previewUrl?: string | null
  /** 초기 미리보기(previewUrl)를 사용자가 제거했을 때 호출 — 부모가 previewUrl 을 비운다. */
  onClearPreviewUrl?: () => void
}

export default function CoverImageField({
  category,
  title,
  sourceName,
  value,
  onChange,
  previewUrl = null,
  onClearPreviewUrl,
}: CoverImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isCompressing, setIsCompressing] = useState(false)
  const objectUrl = useMemo(() => (value ? URL.createObjectURL(value) : null), [value])

  // 언마운트·value 변경 시 objectURL revoke (누수 가드)
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [objectUrl])

  const effectiveImageUrl = objectUrl ?? previewUrl
  const hasCover = Boolean(effectiveImageUrl)

  const acceptFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 업로드할 수 있습니다.')
      return
    }
    setError(null)
    setIsCompressing(true)
    try {
      // 368 — 용량이 크면 먼저 자동으로 줄여본다. 그래도 2MB를 넘으면 그때 반려.
      const compressed = await compressImageToLimit(file, { maxBytes: MAX_BYTES })
      if (compressed.size > MAX_BYTES) {
        setError('이미지 용량은 2MB 이하여야 합니다.')
        return
      }
      onChange(compressed)
    } finally {
      setIsCompressing(false)
    }
  }

  const handleRemove = () => {
    setError(null)
    onChange(null)
    if (inputRef.current) inputRef.current.value = ''
    if (previewUrl) onClearPreviewUrl?.()
  }

  const coverInner = effectiveImageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={effectiveImageUrl} alt="커버 미리보기" className="h-full w-full object-cover" />
  ) : (
    <BrandedCover category={category} title={title || '제목 미입력'} sourceName={sourceName} />
  )

  return (
    <div className="space-y-3">
      <div className="aspect-[16/9] w-full max-w-md overflow-hidden rounded-xl border border-border bg-muted">
        {coverInner}
      </div>

      {error && <p className="text-xs text-negative">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isCompressing}
          onClick={() => inputRef.current?.click()}
        >
          {isCompressing ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="mr-1.5 h-3.5 w-3.5" />
          )}
          {hasCover ? '교체' : '업로드'}
        </Button>
        {hasCover && (
          <Button type="button" variant="ghost" size="sm" onClick={handleRemove}>
            <X className="mr-1.5 h-3.5 w-3.5" />
            제거
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void acceptFile(f)
          }}
        />
      </div>

      <p className="text-xs text-muted-foreground">권장 1200×675 (16:9). 이미지 파일. 용량이 크면 자동으로 줄입니다.</p>

      {!hasCover && (
        <div className="flex items-start gap-1.5 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <ImageIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>커버를 지정하지 않으면 기본 표지가 표시됩니다.</span>
        </div>
      )}

      {/* 모바일·웹 카드 미리보기 — 실제 노출 형태 확인용 */}
      <div className="grid grid-cols-2 gap-4 pt-1">
        <div>
          <p className="mb-1 text-[11px] text-muted-foreground">웹 카드 미리보기</p>
          <div className="w-full max-w-[280px] overflow-hidden rounded-xl border border-border bg-card">
            <div className="aspect-[16/9] overflow-hidden bg-muted">{coverInner}</div>
            <div className="p-3">
              <p className="line-clamp-2 text-xs font-medium text-foreground">
                {title || '제목 미입력'}
              </p>
            </div>
          </div>
        </div>
        <div>
          <p className="mb-1 text-[11px] text-muted-foreground">모바일 카드 미리보기</p>
          <div className="w-full max-w-[160px] overflow-hidden rounded-xl border border-border bg-card">
            <div className="aspect-[16/9] overflow-hidden bg-muted">{coverInner}</div>
            <div className="p-2">
              <p className="line-clamp-2 text-[10px] font-medium text-foreground">
                {title || '제목 미입력'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

