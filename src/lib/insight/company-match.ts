import 'server-only'

/**
 * 회사명과 별칭을 PostgREST OR 검색식으로 변환한다.
 * ilike 와일드카드 문자는 리터럴로 취급해 회사명이 검색 범위를 넓히지 않게 한다.
 */
export function buildCompanyMatchOr(name: string, aliases: string[]): string {
  const terms = [...new Set([name, ...aliases].map((term) => term.trim()).filter(Boolean))]

  return terms
    .map((term) => term.replace(/[%_\\]/g, '\\$&'))
    .flatMap((escaped) => [
      `title.ilike.%${escaped}%`,
      `summary_ko.ilike.%${escaped}%`,
    ])
    .join(',')
}

/** 서버 조회 시점을 기준으로 최근 N일의 시작 시각을 계산한다. */
export function getCompanyNewsSinceIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}
