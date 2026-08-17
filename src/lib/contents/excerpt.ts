export function toExcerpt(summaryKo: string | null, bodyOriginal: string | null, max = 120): string | null {
  const raw = summaryKo?.trim() || bodyOriginal?.trim()
  if (!raw) return null
  const text = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > max ? text.slice(0, max) + '…' : text
}

/** 콘텐츠 상세·필터 목록으로 이동하는 태그 클릭 목적지. 카드마다 흩어져 있던
 *  href 조립을 여기 한 곳으로 모은다(지시서 514). */
export function tagFilterHref(category: string, tag: string): string {
  return `/dashboard/contents?category=${encodeURIComponent(category)}&kw=${encodeURIComponent(tag)}`
}

/**
 * 매칭 그룹 + 매칭 키워드 합집합에서 카테고리와 동일한 태그 제외(대소문자·공백 무시). 총 상한 6.
 *
 * 514 — 'AI 기술'·'IT 동향' 같은 상위 태그가 발행물 90%+에 붙어 카드 변별력이 0이었다.
 * freqMap(태그→최근 30일 문서빈도, /api/contents/keywords 의 frequencies)을 주면 희소한
 * 태그를 앞에 오도록 정렬한 뒤 상한을 자른다 — freqMap이 없으면(호출부가 아직 안 가져왔거나
 * 서버사이드 리포트 집계처럼 fetch가 어려운 경로) 기존 순서를 그대로 쓴다(무회귀).
 *
 * 대소문자 중복 제거는 freqMap 유무와 무관하게 항상 적용한다 — 'KT'·'kt'가 같은 문서에
 * 나란히 붙는 문제는 정렬 방식과 별개로 항상 발생하던 버그였다. 표기는 첫 등장 형태 유지.
 */
export function tagsOf2(
  matchedGroups: string[],
  matchedKeywords: string[],
  category: string,
  freqMap?: Record<string, number>
): string[] {
  const catLower = (category ?? '').trim().toLowerCase()
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const raw of [...matchedGroups, ...matchedKeywords]) {
    const tag = raw.trim()
    if (!tag) continue
    const lower = tag.toLowerCase()
    if (lower === catLower || seen.has(lower)) continue
    seen.add(lower)
    deduped.push(tag)
  }

  if (!freqMap) return deduped.slice(0, 6)

  // freqMap 키는 소문자(/api/contents/keywords 참고) — 이 함수가 만든 원문 표기와
  // 대조하려면 조회도 소문자로 해야 한다.
  return deduped
    .slice()
    .sort((a, b) => (freqMap[a.toLowerCase()] ?? Infinity) - (freqMap[b.toLowerCase()] ?? Infinity))
    .slice(0, 6)
}
