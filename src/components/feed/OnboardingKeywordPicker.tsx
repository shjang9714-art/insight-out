'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import ContentCard from '@/components/dashboard/ContentCard'
import { toExcerpt, tagsOf2 } from '@/lib/contents/excerpt'
import { type ContentCategory } from '@/lib/types'
import { MIN_ONBOARDING_KEYWORDS, MAX_ONBOARDING_KEYWORDS } from '@/lib/preferences'

interface ServiceOption {
  id: string
  name: string
}

interface KeywordOption {
  id: string
  name: string
}

interface PreviewItem {
  id: string
  title: string
  summary_ko: string | null
  body_original: string | null
  category: ContentCategory
  published_at: string | null
  thumbnail_url: string | null
  sources: { name: string } | null
  matched_groups: string[]
  matched_keywords: string[]
}

interface OnboardingKeywordPickerProps {
  services: ServiceOption[]
  mode: 'onboarding' | 'edit'
  initialServiceId?: string | null
  initialKeywordIds?: string[]
  initialKeywordMap?: Record<string, string>
  onSaved?: () => void
  onCancel?: () => void
}

export default function OnboardingKeywordPicker({
  services,
  mode,
  initialServiceId = null,
  initialKeywordIds = [],
  initialKeywordMap = {},
  onSaved,
  onCancel,
}: OnboardingKeywordPickerProps) {
  const router = useRouter()
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
    initialServiceId ?? services[0]?.id ?? null
  )
  const [selectedKeywordIds, setSelectedKeywordIds] = useState<string[]>(initialKeywordIds)
  const [keywordNameById, setKeywordNameById] = useState<Record<string, string>>(initialKeywordMap)
  const [availableKeywords, setAvailableKeywords] = useState<KeywordOption[]>([])
  const [isLoadingKeywords, setIsLoadingKeywords] = useState(false)
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isSkipping, setIsSkipping] = useState(false)

  // 서비스 전환 시 키워드 칩 목록 갱신 (선택 상태는 유지)
  useEffect(() => {
    if (!selectedServiceId) return
    let cancelled = false

    const fetchKeywords = async () => {
      setIsLoadingKeywords(true)
      try {
        const res = await fetch(`/api/keywords/top?service_id=${selectedServiceId}&limit=30`)
        const body = (await res.json()) as { keywords?: KeywordOption[] }
        if (!cancelled) setAvailableKeywords(body.keywords ?? [])
      } catch {
        if (!cancelled) setAvailableKeywords([])
      } finally {
        if (!cancelled) setIsLoadingKeywords(false)
      }
    }

    fetchKeywords()
    return () => {
      cancelled = true
    }
  }, [selectedServiceId])

  // 키워드 선택 변경 시 디바운스 후 미리보기 콘텐츠 조회
  useEffect(() => {
    let cancelled = false
    const names = selectedKeywordIds.map((id) => keywordNameById[id]).filter(Boolean)

    const timer = setTimeout(async () => {
      if (names.length === 0) {
        if (!cancelled) setPreviewItems([])
        return
      }
      const supabase = createClient()
      const { data } = await supabase
        .from('contents')
        .select(
          'id, title, summary_ko, body_original, category, published_at, thumbnail_url, sources(name), matched_groups, matched_keywords'
        )
        .eq('status', 'published')
        .overlaps('matched_keywords', names)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(2)
      if (!cancelled) setPreviewItems((data ?? []) as unknown as PreviewItem[])
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keywordNameById 는 토글 시점에만 갱신되어 selectedKeywordIds 와 함께 안정적으로 변함
  }, [selectedKeywordIds])

  const canSave = selectedKeywordIds.length >= MIN_ONBOARDING_KEYWORDS && !!selectedServiceId

  function toggleKeyword(keyword: KeywordOption) {
    setSelectedKeywordIds((prev) => {
      if (prev.includes(keyword.id)) {
        return prev.filter((id) => id !== keyword.id)
      }
      if (prev.length >= MAX_ONBOARDING_KEYWORDS) {
        toast.error(`키워드는 최대 ${MAX_ONBOARDING_KEYWORDS}개까지 선택할 수 있습니다.`)
        return prev
      }
      return [...prev, keyword.id]
    })
    setKeywordNameById((prev) => ({ ...prev, [keyword.id]: keyword.name }))
  }

  async function handleSave() {
    if (!selectedServiceId) {
      toast.error('서비스를 먼저 선택해주세요.')
      return
    }
    if (selectedKeywordIds.length < MIN_ONBOARDING_KEYWORDS) {
      toast.error(`키워드를 최소 ${MIN_ONBOARDING_KEYWORDS}개 선택해주세요.`)
      return
    }
    setIsSaving(true)
    try {
      const res = await fetch('/api/preferences/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: selectedServiceId, keyword_ids: selectedKeywordIds }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? '저장에 실패했습니다.')
      }
      toast.success('관심 키워드가 저장되었습니다.')
      if (onSaved) {
        onSaved()
      } else {
        router.refresh()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSkip() {
    setIsSkipping(true)
    try {
      const res = await fetch('/api/preferences/skip', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? '건너뛰기에 실패했습니다.')
      }
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '건너뛰기에 실패했습니다.')
    } finally {
      setIsSkipping(false)
    }
  }

  const heading = useMemo(
    () =>
      mode === 'edit'
        ? '관심 키워드를 다시 골라 추천 피드를 바꿔보세요'
        : '🎯 관심 키워드를 골라 맞춤 피드를 만들어요',
    [mode]
  )

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold text-foreground">{heading}</h2>

      {/* 서비스 선택 */}
      <div className="mb-4 flex flex-wrap gap-2">
        {services.map((service) => (
          <Button
            key={service.id}
            type="button"
            size="sm"
            variant={selectedServiceId === service.id ? 'default' : 'outline'}
            onClick={() => setSelectedServiceId(service.id)}
          >
            {service.name}
          </Button>
        ))}
      </div>

      {/* 키워드 칩 */}
      <div className="mb-4 flex flex-wrap gap-2">
        {isLoadingKeywords ? (
          <p className="text-xs text-muted-foreground">키워드를 불러오는 중...</p>
        ) : availableKeywords.length === 0 ? (
          <p className="text-xs text-muted-foreground">이 서비스에 추천할 키워드가 아직 없습니다.</p>
        ) : (
          availableKeywords.map((keyword) => (
            <Toggle
              key={keyword.id}
              size="sm"
              pressed={selectedKeywordIds.includes(keyword.id)}
              onPressedChange={() => toggleKeyword(keyword)}
              className="border border-border data-[state=on]:border-brand-200 data-[state=on]:bg-brand-50 data-[state=on]:text-brand-700"
            >
              #{keyword.name}
            </Toggle>
          ))
        )}
      </div>

      {/* 미리보기 */}
      {previewItems.length > 0 && (
        <div className="mb-4 rounded-xl border border-dashed border-border p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">미리보기</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {previewItems.map((item) => (
              <ContentCard
                key={item.id}
                id={item.id}
                title={item.title}
                summaryKo={toExcerpt(item.summary_ko, item.body_original)}
                category={item.category}
                sourceName={item.sources?.name ?? null}
                publishedAt={item.published_at}
                thumbnailUrl={item.thumbnail_url}
                keywords={tagsOf2(item.matched_groups ?? [], item.matched_keywords ?? [], item.category)}
              />
            ))}
          </div>
        </div>
      )}

      {/* 하단 액션 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          선택: {selectedKeywordIds.length} / 최대 {MAX_ONBOARDING_KEYWORDS}
        </span>
        <div className="flex gap-2">
          {mode === 'onboarding' && (
            <Button type="button" variant="ghost" size="sm" disabled={isSkipping} onClick={handleSkip}>
              건너뛰기
            </Button>
          )}
          {mode === 'edit' && onCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              취소
            </Button>
          )}
          <Button type="button" size="sm" disabled={!canSave || isSaving} onClick={handleSave}>
            {mode === 'edit' ? '저장' : '추천 피드 시작 →'}
          </Button>
        </div>
      </div>
    </div>
  )
}
