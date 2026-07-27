/**
 * 뉴스레터 주식·증권·개인투자 콘텐츠 전면 제외 필터(지시서 20260723).
 *
 * STEP 0 조사 결과: `contents.category` enum에는 증권/주식 전용 값이 없다
 * (실제 운영 데이터는 뉴스/유튜브/리포트/웹인사이트뿐이고, 증권 기사도 전부
 * '뉴스' 카테고리로 들어온다). 따라서 카테고리 매핑 제외는 적용 대상이 없고,
 * 제목+요약 키워드 매칭이 사실상 유일한 실질 필터다.
 *
 * "투자" 단독 키워드는 의도적으로 제외 목록에 넣지 않는다 — 통신 설비/인프라
 * 투자(CapEx) 기사까지 오탐 제외되는 것을 막기 위함(지시서 STEP 1-3 명시 사항).
 */

// 관리자가 추후 조정하기 쉽도록 배열 상수로 분리.
export const STOCK_EXCLUDE_KEYWORDS: readonly string[] = [
  '증권', '증시', '주가', '주식', '코스피', '코스닥', '나스닥', '상장', 'IPO', '공모주',
  '배당', '종목', '매수', '매도', '목표주가', 'ETF', '펀드', '유언대용신탁', '자산관리',
  '투자자문', '리딩방', '수익률', '시세', '급등주', '테마주',
]

// 실제 운영 카테고리 값에는 증권 전용 값이 없다(STEP 0 확인) — 향후 카테고리가
// 세분화될 경우를 대비해 자리만 남겨둔다. 현재는 항상 빈 결과.
const STOCK_EXCLUDE_CATEGORIES: readonly string[] = []

export interface FilterableContent {
  id: string
  title: string
  category: string | null
  summary_ko?: string | null
}

export interface FilterResult<T extends FilterableContent> {
  kept: T[]
  excluded: { content: T; reason: string }[]
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '')
}

/** 단일 콘텐츠가 주식·증권 계열인지 판정. 매칭되면 제외 사유 문자열, 아니면 null. */
export function detectStockExclusionReason(content: FilterableContent): string | null {
  if (content.category && STOCK_EXCLUDE_CATEGORIES.includes(content.category)) {
    return `카테고리:${content.category}`
  }

  const haystack = normalize(`${content.title} ${content.summary_ko ?? ''}`)
  for (const keyword of STOCK_EXCLUDE_KEYWORDS) {
    if (haystack.includes(normalize(keyword))) {
      return `키워드:${keyword}`
    }
  }

  return null
}

/** 콘텐츠 배열에서 주식·증권 콘텐츠를 제외하고, 제외 목록은 사유와 함께 console.log로 남긴다. */
export function filterOutStockContent<T extends FilterableContent>(contents: T[]): FilterResult<T> {
  const kept: T[] = []
  const excluded: { content: T; reason: string }[] = []

  for (const content of contents) {
    const reason = detectStockExclusionReason(content)
    if (reason) {
      excluded.push({ content, reason })
      console.log(`[뉴스레터/주식필터] 제외: "${content.title}" (${reason})`)
    } else {
      kept.push(content)
    }
  }

  return { kept, excluded }
}

/**
 * 뉴스레터 "오늘의 주요 뉴스" 유튜브 콘텐츠 전면 제외 필터.
 *
 * 뉴스레터 카드는 뉴스 기사만 노출한다 — 유튜브 콘텐츠는 아래 세 기준 중
 * 하나라도 해당하면 제외한다(소스 시드 데이터가 카테고리/소스타입/URL 중
 * 어느 쪽으로 들어오든 걸러지도록 이중 방어):
 * - `category` 가 '유튜브'
 * - 콘텐츠의 `sources.type` 이 'youtube_channel'
 * - `original_url` 도메인이 youtube.com 또는 youtu.be
 */
const YOUTUBE_URL_PATTERN = /(?:^https?:\/\/)?(?:[\w-]+\.)*(?:youtube\.com|youtu\.be)\//i

export interface YoutubeFilterableContent {
  id: string
  title: string
  category: string | null
  originalUrl?: string | null
  sourceType?: string | null
}

/** 단일 콘텐츠가 유튜브 계열인지 판정. 매칭되면 제외 사유 문자열, 아니면 null. */
export function detectYoutubeExclusionReason(content: YoutubeFilterableContent): string | null {
  if (content.category === '유튜브') {
    return '카테고리:유튜브'
  }
  if (content.sourceType === 'youtube_channel') {
    return '소스타입:youtube_channel'
  }
  if (content.originalUrl && YOUTUBE_URL_PATTERN.test(content.originalUrl)) {
    return `URL:${content.originalUrl}`
  }
  return null
}

/** 콘텐츠 배열에서 유튜브 콘텐츠를 제외하고, 제외 목록은 사유와 함께 console.log로 남긴다. */
export function filterOutYoutubeContent<T extends YoutubeFilterableContent>(contents: T[]): FilterResult<T> {
  const kept: T[] = []
  const excluded: { content: T; reason: string }[] = []

  for (const content of contents) {
    const reason = detectYoutubeExclusionReason(content)
    if (reason) {
      excluded.push({ content, reason })
      console.log(`[뉴스레터/유튜브필터] 제외: "${content.title}" (${reason})`)
    } else {
      kept.push(content)
    }
  }

  return { kept, excluded }
}
