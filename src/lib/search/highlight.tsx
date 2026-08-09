// 검색 결과 제목에서 검색어와 일치하는 부분을 <mark>로 강조(D 스펙).
// React가 문자열을 텍스트 노드로만 렌더하므로(dangerouslySetInnerHTML 미사용) XSS 위험 없음 —
// 검색어에 <script> 등이 들어와도 그대로 순수 텍스트로 표시된다.

import type { ReactNode } from 'react'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function highlightMatches(text: string, query: string): ReactNode {
  const tokens = Array.from(new Set(query.trim().split(/\s+/).filter(Boolean))).map(escapeRegExp)
  if (tokens.length === 0) return text

  const re = new RegExp(`(${tokens.join('|')})`, 'gi')
  const parts = text.split(re)
  // split(re)를 캡처 그룹 1개로 호출하면 홀수 인덱스가 항상 매칭된 부분 문자열이다.
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded-sm bg-brand-100 px-0.5 text-brand-800 dark:bg-brand-900/50 dark:text-brand-200">
        {part}
      </mark>
    ) : (
      part
    )
  )
}
