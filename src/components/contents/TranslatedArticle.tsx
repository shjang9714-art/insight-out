'use client'

import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface TranslatedArticleProps {
  translatedTitle: string
  translatedBody: string
  originalTitle: string
  originalBody: string
  children: ReactNode
}

export default function TranslatedArticle({
  translatedTitle,
  translatedBody,
  originalTitle,
  originalBody,
  children,
}: TranslatedArticleProps) {
  const [showOriginal, setShowOriginal] = useState(false)

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <h1 className="min-w-0 flex-1 text-xl font-bold leading-snug text-gray-900">
          {showOriginal ? originalTitle : translatedTitle}
        </h1>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setShowOriginal((current) => !current)}
        >
          {showOriginal ? '한국어 번역' : '영어 원문'}
        </Button>
      </div>

      {children}

      <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
        {showOriginal ? originalBody : translatedBody}
      </p>
    </>
  )
}
