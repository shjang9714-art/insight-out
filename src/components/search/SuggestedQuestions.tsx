'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useLensContext } from '@/lib/lens'
import { buildSuggestedQuestions } from '@/lib/search/suggested-questions'
import { Sparkles } from 'lucide-react'

async function fetchTopThemes(): Promise<string[]> {
  const supabase = createClient()
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

  const { data } = await supabase
    .from('contents')
    .select('matched_groups')
    .gte('collected_at', since)
    .eq('status', 'published')
    .not('matched_groups', 'is', null)
    .limit(500)

  if (!data) return []

  const counts: Record<string, number> = {}
  for (const row of data as { matched_groups: string[] | null }[]) {
    for (const g of row.matched_groups ?? []) {
      counts[g] = (counts[g] ?? 0) + 1
    }
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([g]) => g)
}

interface Props {
  className?: string
  onSelect?: (q: string) => void
}

export default function SuggestedQuestions({ className, onSelect }: Props) {
  const router = useRouter()
  const ctx = useLensContext()
  const [questions, setQuestions] = useState<string[]>([])

  useEffect(() => {
    fetchTopThemes().then(topThemes => {
      setQuestions(buildSuggestedQuestions(ctx, topThemes))
    })
  }, [ctx.watchlist.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  if (questions.length === 0) return null

  return (
    <div className={className}>
      <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" />
        이런 걸 물어보세요
      </div>
      <div className="flex flex-wrap gap-2">
        {questions.map(q => (
          <button
            key={q}
            onClick={() => onSelect ? onSelect(q) : router.push(`/dashboard/search?q=${encodeURIComponent(q)}`)}
            className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-brand-600 hover:bg-brand-100 hover:text-brand-700"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}
