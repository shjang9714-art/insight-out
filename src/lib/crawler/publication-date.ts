// 문자열 끝에 UTC 표기(Z, ±HH:mm, GMT, UTC)가 있는지 검사
const TZ_SUFFIX_PATTERN = /(Z|[+-]\d{2}:?\d{2}|GMT|UTC)\s*$/i

// 타임존 정보 없는 "YYYY-MM-DD[ T]HH:mm[:ss]" 형태
const NAIVE_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/

/**
 * RSS pubDate 문자열을 Date 로 변환한다.
 * 타임존 표기가 없는 날짜 문자열은 국내 소스 기준 KST(UTC+9) 로 간주해 변환한다.
 * (그냥 new Date(str) 로 파싱하면 서버 실행 환경의 UTC 기준으로 오해석되어
 *  실제 시각보다 9시간 앞선 시각으로 저장되는 버그가 있었음 — 이후 화면 표시 단계에서
 *  KST 변환(+9h)이 한 번 더 적용되면서 최종적으로 다음날로 표시됨)
 */
export function parseFeedDate(raw: string | undefined | null): Date | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (TZ_SUFFIX_PATTERN.test(trimmed)) {
    const d = new Date(trimmed)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const m = trimmed.match(NAIVE_DATETIME_PATTERN)
  if (m) {
    const [, y, mo, da, h, mi, s] = m
    const utcMs = Date.UTC(
      Number(y), Number(mo) - 1, Number(da),
      Number(h), Number(mi), Number(s ?? '0')
    ) - 9 * 3_600_000
    return new Date(utcMs)
  }

  const d = new Date(trimmed)
  return Number.isNaN(d.getTime()) ? null : d
}

export function getPublishedAtSince(
  publishedAt: string | undefined,
  since: string
): string | null {
  if (!publishedAt) return null

  const sinceDate = new Date(since)
  if (Number.isNaN(sinceDate.getTime())) {
    throw new Error('수집 기준 날짜가 올바르지 않습니다.')
  }

  const publishedDate = parseFeedDate(publishedAt)
  if (
    !publishedDate
    || publishedDate.getTime() < sinceDate.getTime()
  ) {
    return null
  }

  return publishedDate.toISOString()
}
