export function getPublishedAtSince(
  publishedAt: string | undefined,
  since: string
): string | null {
  if (!publishedAt) return null

  const sinceDate = new Date(since)
  if (Number.isNaN(sinceDate.getTime())) {
    throw new Error('수집 기준 날짜가 올바르지 않습니다.')
  }

  const publishedDate = new Date(publishedAt)
  if (
    Number.isNaN(publishedDate.getTime())
    || publishedDate.getTime() < sinceDate.getTime()
  ) {
    return null
  }

  return publishedDate.toISOString()
}
