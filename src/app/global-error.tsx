'use client'

import { useEffect } from 'react'

/**
 * 루트 레이아웃 자체가 깨졌을 때의 최후 방어선 — 이 경우 root layout(및 globals.css)이
 * 대체되므로 Tailwind 없이 인라인 스타일로 최소 "준비중" 화면을 그린다.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: '#111827',
          background: '#ffffff',
          textAlign: 'center',
          padding: '2rem',
        }}
      >
        <h1 style={{ fontSize: '1.125rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
          콘텐츠 준비중...
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', maxWidth: '28rem', lineHeight: 1.6 }}>
          일시적인 문제로 화면을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: '1.5rem',
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            border: 'none',
            background: '#e6007e',
            color: '#ffffff',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          다시 시도
        </button>
      </body>
    </html>
  )
}
