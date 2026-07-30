'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Loader2, Sparkles, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const POPULAR_LIMIT = 12
const SEARCH_LIMIT = 10
const DEBOUNCE_MS = 250

interface SuggestionsResponse {
  suggestions?: unknown
  error?: unknown
}

interface Props {
  value: string[]
  onChange: (keywords: string[]) => void
  title: string
  snippet: string
  inputId: string
}

function keywordKey(value: string): string {
  return value.trim().replace(/\s+/g, '').toLocaleLowerCase('ko-KR')
}

function parseSuggestions(data: SuggestionsResponse): string[] {
  if (!Array.isArray(data.suggestions)) return []
  return data.suggestions.filter(
    (suggestion): suggestion is string =>
      typeof suggestion === 'string' && suggestion.trim().length > 0,
  )
}

export default function KeywordTagInput({
  value,
  onChange,
  title,
  snippet,
  inputId,
}: Props) {
  const listboxId = `${useId()}-suggestions`
  const inputRef = useRef<HTMLInputElement>(null)
  const [inputValue, setInputValue] = useState('')
  const [popularSuggestions, setPopularSuggestions] = useState<string[]>([])
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([])
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [isOpen, setIsOpen] = useState(false)
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const selectedKeys = new Set(value.map(keywordKey))
  const availablePopular = popularSuggestions.filter(
    (suggestion) => !selectedKeys.has(keywordKey(suggestion)),
  )
  const availableSearch = searchSuggestions.filter(
    (suggestion) => !selectedKeys.has(keywordKey(suggestion)),
  )
  const availableAi = aiSuggestions.filter(
    (suggestion) => !selectedKeys.has(keywordKey(suggestion)),
  )
  const showDropdown = isOpen && availableSearch.length > 0

  useEffect(() => {
    const controller = new AbortController()

    fetch(`/api/admin/keyword-suggestions?limit=${POPULAR_LIMIT}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return { suggestions: [] } satisfies SuggestionsResponse
        return response.json() as Promise<SuggestionsResponse>
      })
      .then((data) => setPopularSuggestions(parseSuggestions(data)))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setPopularSuggestions([])
        }
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const query = inputValue.trim()
    if (!query) return

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      fetch(
        `/api/admin/keyword-suggestions?q=${encodeURIComponent(query)}&limit=${SEARCH_LIMIT}`,
        { signal: controller.signal },
      )
        .then(async (response) => {
          if (!response.ok) return { suggestions: [] } satisfies SuggestionsResponse
          return response.json() as Promise<SuggestionsResponse>
        })
        .then((data) => {
          const suggestions = parseSuggestions(data)
          setSearchSuggestions(suggestions)
          setActiveIndex(suggestions.length > 0 ? 0 : -1)
          setIsOpen(suggestions.length > 0)
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === 'AbortError')) {
            setSearchSuggestions([])
            setActiveIndex(-1)
            setIsOpen(false)
          }
        })
    }, DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [inputValue])

  function addKeyword(rawKeyword: string) {
    const keyword = rawKeyword.trim()
    if (!keyword) return
    if (!selectedKeys.has(keywordKey(keyword))) {
      onChange([...value, keyword])
    }
    setInputValue('')
    setSearchSuggestions([])
    setActiveIndex(-1)
    setIsOpen(false)
  }

  function removeKeyword(keyword: string) {
    const targetKey = keywordKey(keyword)
    onChange(value.filter((item) => keywordKey(item) !== targetKey))
  }

  function handleInputChange(nextValue: string) {
    setInputValue(nextValue)
    if (!nextValue.trim()) {
      setSearchSuggestions([])
      setActiveIndex(-1)
      setIsOpen(false)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && availableSearch.length > 0) {
      event.preventDefault()
      setIsOpen(true)
      setActiveIndex((current) => (current + 1) % availableSearch.length)
      return
    }
    if (event.key === 'ArrowUp' && availableSearch.length > 0) {
      event.preventDefault()
      setIsOpen(true)
      setActiveIndex((current) =>
        current <= 0 ? availableSearch.length - 1 : current - 1,
      )
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const selected = showDropdown ? availableSearch[activeIndex] : undefined
      addKeyword(selected ?? inputValue)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setIsOpen(false)
      setActiveIndex(-1)
      return
    }
    if (event.key === 'Backspace' && !inputValue && value.length > 0) {
      removeKeyword(value[value.length - 1])
    }
  }

  async function requestAiSuggestions() {
    if (!title.trim()) {
      setAiError('AI 제안을 받으려면 제목을 입력해주세요.')
      return
    }

    setIsAiLoading(true)
    setAiError(null)
    setAiSuggestions([])

    try {
      const response = await fetch('/api/admin/keyword-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, snippet: snippet.slice(0, 1000) }),
      })
      const data = await response.json() as SuggestionsResponse
      if (!response.ok) {
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'AI 키워드 제안을 생성하지 못했습니다.',
        )
      }

      const suggestions = parseSuggestions(data).filter(
        (suggestion) => !selectedKeys.has(keywordKey(suggestion)),
      )
      setAiSuggestions(suggestions)
      if (suggestions.length === 0) {
        setAiError('AI가 제안할 키워드를 찾지 못했습니다. 수동으로 입력해주세요.')
      }
    } catch (error) {
      setAiError(
        error instanceof Error
          ? error.message
          : 'AI 키워드 제안을 생성하지 못했습니다. 수동으로 입력해주세요.',
      )
    } finally {
      setIsAiLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <div
          onClick={() => inputRef.current?.focus()}
          className="flex min-h-[44px] cursor-text flex-wrap items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring"
        >
          {value.map((keyword) => (
            <Badge key={keywordKey(keyword)} variant="secondary" className="gap-1 pr-1 text-xs">
              {keyword}
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation()
                  removeKeyword(keyword)
                }}
                className="rounded-full p-0.5 hover:bg-accent"
                aria-label={`${keyword} 삭제`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showDropdown}
            aria-controls={listboxId}
            aria-activedescendant={
              showDropdown && activeIndex >= 0
                ? `${listboxId}-${activeIndex}`
                : undefined
            }
            value={inputValue}
            onChange={(event) => handleInputChange(event.target.value)}
            onFocus={() => setIsOpen(availableSearch.length > 0)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              addKeyword(inputValue)
              setIsOpen(false)
            }}
            placeholder={value.length === 0 ? 'Enter로 키워드 추가 (예: 클라우드, AI, 보안)' : ''}
            className="min-w-[160px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {showDropdown && (
          <div
            id={listboxId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md"
          >
            {availableSearch.map((suggestion, index) => (
              <button
                key={keywordKey(suggestion)}
                id={`${listboxId}-${index}`}
                type="button"
                role="option"
                aria-selected={activeIndex === index}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addKeyword(suggestion)}
                className={cn(
                  'flex w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                  activeIndex === index
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-foreground hover:bg-secondary hover:text-secondary-foreground',
                )}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Enter 또는 포커스 이탈 시 추가 · ↑↓로 후보 이동 · Esc로 닫기 · Backspace로 마지막 태그 삭제
      </p>

      {availablePopular.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">자주 사용한 키워드</p>
          <div className="flex flex-wrap gap-1.5">
            {availablePopular.map((suggestion) => (
              <button
                key={keywordKey(suggestion)}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addKeyword(suggestion)}
                className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground transition-colors hover:bg-accent"
              >
                + {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onMouseDown={(event) => event.preventDefault()}
          onClick={requestAiSuggestions}
          disabled={isAiLoading}
          className="gap-1.5"
        >
          {isAiLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {isAiLoading ? 'AI 제안 중...' : 'AI 키워드 제안'}
        </Button>

        {aiError && (
          <p className="text-xs text-negative" role="status">
            {aiError}
          </p>
        )}

        {availableAi.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              AI 제안 · 클릭해서 채택
            </p>
            <div className="flex flex-wrap gap-1.5">
              {availableAi.map((suggestion) => (
                <button
                  key={keywordKey(suggestion)}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => addKeyword(suggestion)}
                  className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground transition-colors hover:bg-accent"
                >
                  + {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
