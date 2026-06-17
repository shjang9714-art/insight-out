const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&nbsp;': ' ',
  '&middot;': '·',
}

const ENTITY_PATTERN = new RegExp(Object.keys(HTML_ENTITIES).join('|'), 'gi')

export function tokenizeTitle(title: string): string[] {
  return title
    .replace(ENTITY_PATTERN, (m) => HTML_ENTITIES[m.toLowerCase()] ?? m)
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map((t) => t.toLowerCase())
}

export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const setA = new Set(a)
  const setB = new Set(b)
  let intersection = 0
  for (const token of setA) {
    if (setB.has(token)) intersection++
  }
  const union = new Set([...setA, ...setB]).size
  return union === 0 ? 0 : intersection / union
}

export function dedupSimilarItems<T extends { title: string }>(
  items: T[],
  threshold = 0.4,
): T[] {
  const kept: { item: T; tokens: string[] }[] = []
  for (const item of items) {
    const tokens = tokenizeTitle(item.title)
    const isDuplicate = kept.some(
      (k) => jaccardSimilarity(tokens, k.tokens) >= threshold,
    )
    if (!isDuplicate) {
      kept.push({ item, tokens })
    }
  }
  return kept.map((k) => k.item)
}
