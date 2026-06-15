/**
 * 홈 피드 노출 레이어 블록리스트 — B2B M.I와 무관한 콘텐츠 필터
 *
 * ⚠️ 수집 레이어(crawler)는 건드리지 않음. 화면 노출 단계에서만 적용.
 * ⚠️ RELATEDNESS_GATING_ENABLED 값은 이 파일과 무관하며 변경 금지.
 */

/** e스포츠/게임 키워드 */
const ESPORTS_KEYWORDS = [
  '젠지', 'T1', 'LoL', '리그오브레전드', 'MSI', '롤드컵', 'LCK',
  'e스포츠', '이스포츠', '게임단', '프로게이머', '서머스플릿',
  '게임 출시', '게임 개발', '게임사', '모바일게임', '온라인게임',
  '배틀그라운드', '오버워치', '발로란트', '스타크래프트', 'DRX',
]

/** 부동산/주거 키워드 */
const REALESTATE_KEYWORDS = [
  '아파트값', '아파트 매매', '전세', '분양', '재건축', '재개발',
  '임대차', '월세', '집값', '부동산 시장', '공시지가', '주택담보',
  '갭투자', '청약', '입주물량', '강서 매매',
]

/** 연예/스포츠/일반 소비자 키워드 */
const ENTERTAINMENT_KEYWORDS = [
  '아이돌', '콘서트', '드라마 시청률', '영화 흥행', '박스오피스',
  '야구 순위', '축구 결과', '골프', '수영', '마라톤', '올림픽 메달',
  '연예인', '팬미팅', '데뷔 앨범', 'OST',
]

/** 통합 블록리스트 */
export const FEED_BLOCKLIST: string[] = [
  ...ESPORTS_KEYWORDS,
  ...REALESTATE_KEYWORDS,
  ...ENTERTAINMENT_KEYWORDS,
]

/**
 * 제목 또는 요약에 블록 키워드가 포함된 경우 false를 반환.
 * 대소문자 구분 없음.
 */
export function isB2BRelevant(title: string, summaryKo: string | null): boolean {
  const text = (title + ' ' + (summaryKo ?? '')).toLowerCase()
  return !FEED_BLOCKLIST.some((kw) => text.includes(kw.toLowerCase()))
}
