// candidates.ts(서버 전용) 와 클라이언트 컴포넌트가 함께 참조하는 상수.
// 'server-only' 가드가 없는 별도 파일로 분리 — candidates.ts 에서 그대로 re-export.

export const KEY_INSIGHT_CATEGORIES = [
  '자사·통신사 동향',
  'AIDC·클라우드',
  'AICC·비즈콜',
  '사이버보안',
  '통신사업·커넥티비티',
  '정책·정부',
  '빅테크·One LG',
] as const

export type KeyInsightCategory = typeof KEY_INSIGHT_CATEGORIES[number]
