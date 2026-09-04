'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  fetchSelectableTopics,
  type SelectableTopic,
} from '@/lib/interests/topics'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface Props {
  loading?: boolean
  onBack: () => void
  onComplete: (topicIds: string[]) => void
}

export default function Step2Interests({ loading = false, onBack, onComplete }: Props) {
  const [topics, setTopics] = useState<SelectableTopic[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const loadedTopics = await fetchSelectableTopics(createClient())
        if (!cancelled) setTopics(loadedTopics)
      } catch (error) {
        console.warn('[onboarding] 선택 가능한 토픽 조회 실패:', error)
        if (!cancelled) setLoadError('관심 주제를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  function toggleTopic(topicId: string) {
    setSelectedIds(previous => previous.includes(topicId)
      ? previous.filter(id => id !== topicId)
      : [...previous, topicId])
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">관심 있는 주제를 골라주세요</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          고른 주제의 소식을 먼저 보여드려요. 나중에 언제든 바꿀 수 있어요
        </p>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="관심 주제 목록">
        {topics.map(topic => {
          const selected = selectedIds.includes(topic.id)
          return (
            <button
              key={topic.id}
              type="button"
              aria-pressed={selected}
              disabled={loading}
              onClick={() => toggleTopic(topic.id)}
              className={cn(
                'rounded-full border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50',
                selected
                  ? 'border-brand-600 bg-brand-600/10 text-brand-600'
                  : 'border-border text-muted-foreground hover:border-brand-200 hover:text-foreground',
              )}
            >
              {selected && <Check className="mr-1 inline h-3.5 w-3.5" />}
              {topic.name}
            </button>
          )
        })}
      </div>

      {loadError && <p className="text-sm text-negative">{loadError}</p>}

      <div className="flex gap-2">
        <Button type="button" variant="outline" className="h-10" disabled={loading} onClick={onBack}>
          이전
        </Button>
        <Button
          type="button"
          className="h-10 flex-1"
          disabled={loading || selectedIds.length === 0}
          onClick={() => onComplete(selectedIds)}
        >
          {loading ? '저장 중...' : '시작하기'}
        </Button>
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={() => onComplete([])}
        className="self-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
      >
        나중에 고를게요
      </button>
    </div>
  )
}
