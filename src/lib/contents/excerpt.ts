export function toExcerpt(summaryKo: string | null, bodyOriginal: string | null, max = 120): string | null {
  const raw = summaryKo?.trim() || bodyOriginal?.trim()
  if (!raw) return null
  const text = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > max ? text.slice(0, max) + '…' : text
}

export function tagsOf(keywords: string[], category: string, services: string[]): string[] {
  const base = keywords.length ? keywords : [category, ...services]
  return [...new Set(base)].slice(0, 4)
}
