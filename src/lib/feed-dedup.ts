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

const KO_SUFFIXES = [
  '이라는', '에서', '에게', '으로', '까지', '부터', '이라', '라는',
  '은', '는', '이', '가', '을', '를', '와', '과', '도', '만', '의', '로', '에',
]

function stripSuffix(token: string): string {
  for (const s of KO_SUFFIXES) {
    if (token.length > s.length && token.endsWith(s)) {
      return token.slice(0, -s.length)
    }
  }
  return token
}

function buildTrigrams(text: string): string[] {
  const cleaned = text.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()
  if (cleaned.length < 3) return []
  const grams: string[] = []
  for (let i = 0; i <= cleaned.length - 3; i++) {
    grams.push(cleaned.slice(i, i + 3))
  }
  return grams
}

export function tokenizeTitle(title: string): string[] {
  const decoded = title.replace(ENTITY_PATTERN, (m) => HTML_ENTITIES[m.toLowerCase()] ?? m)
  const cleaned = decoded.replace(/[^\p{L}\p{N}\s]/gu, '')

  const words = cleaned
    .split(/\s+/)
    .map((t) => stripSuffix(t.toLowerCase()))
    .filter((t) => t.length >= 2)

  const trigrams = buildTrigrams(decoded)

  return [...new Set([...words, ...trigrams])]
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

export function keywordsJaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const setA = new Set(a)
  const setB = new Set(b)
  let intersection = 0
  for (const kw of setA) {
    if (setB.has(kw)) intersection++
  }
  const union = new Set([...setA, ...setB]).size
  return union === 0 ? 0 : intersection / union
}

interface DedupOptions {
  titleThreshold?: number
  keywordsThreshold?: number
}

export function dedupSimilarItems<T extends { title: string; matched_keywords?: string[] }>(
  items: T[],
  options: DedupOptions | number = {},
): T[] {
  const opts: DedupOptions = typeof options === 'number'
    ? { titleThreshold: options }
    : options
  const titleTh = opts.titleThreshold ?? 0.35
  const kwTh = opts.keywordsThreshold ?? 0.5

  const kept: { item: T; tokens: string[]; keywords: string[] }[] = []
  for (const item of items) {
    const tokens = tokenizeTitle(item.title)
    const keywords = item.matched_keywords ?? []
    const isDuplicate = kept.some((k) => {
      if (jaccardSimilarity(tokens, k.tokens) >= titleTh) return true
      if (keywordsJaccard(keywords, k.keywords) >= kwTh) return true
      return false
    })
    if (!isDuplicate) {
      kept.push({ item, tokens, keywords })
    }
  }
  return kept.map((k) => k.item)
}
