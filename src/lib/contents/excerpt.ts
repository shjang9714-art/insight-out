export function toExcerpt(summaryKo: string | null, bodyOriginal: string | null, max = 120): string | null {
  const raw = summaryKo?.trim() || bodyOriginal?.trim()
  if (!raw) return null
  const text = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > max ? text.slice(0, max) + '…' : text
}

export function tagsOf(keywords: string[], category: string): string[] {
  const base = keywords.length ? keywords : [category]
  return [...new Set(base)].slice(0, 4)
}

/** 매칭 그룹 + 매칭 키워드 합집합에서 카테고리와 동일한 태그 제외(대소문자·공백 무시). 총 상한 6. */
export function tagsOf2(matchedGroups: string[], matchedKeywords: string[], category: string): string[] {
  const catLower = (category ?? '').trim().toLowerCase()
  return [...new Set([...matchedGroups, ...matchedKeywords])]
    .filter(t => t.trim().toLowerCase() !== catLower)
    .slice(0, 6)
}
