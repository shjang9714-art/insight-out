// 292 — vercel.json 의 크론과 1:1로 유지할 것. 크론을 추가하면 여기에도 추가한다.
// (감지 장치의 핵심: 여기 빠진 크론은 "계측 안 됨"으로 드러나지 않는다 — §4 회귀 가드 참고)
export interface ExpectedCron {
  key: string
  label: string
  /** 이 시간 안에 어떤 기록이든(succeeded/skipped/failed) 있어야 정상. */
  maxAgeHours: number
}

export const EXPECTED_CRONS: ExpectedCron[] = [
  { key: 'cron:crawl',              label: '크롤',            maxAgeHours: 30 },
  { key: 'cron:briefing',           label: '모닝브리핑',      maxAgeHours: 30 },
  { key: 'cron:newsletter',         label: '뉴스레터',        maxAgeHours: 30 },
  { key: 'cron:body-backfill',      label: '본문 수집',       maxAgeHours: 30 },
  { key: 'cron:signals-backfill',   label: '신호 분류',       maxAgeHours: 30 },
  { key: 'cron:ai-refresh',         label: 'AI 갱신',         maxAgeHours: 30 },
  { key: 'cron:link-health',        label: '링크 헬스',       maxAgeHours: 30 },
  { key: 'cron:key-insights',       label: '핵심 인사이트',   maxAgeHours: 30 },
  { key: 'cron:daily-insights',     label: '일일 인사이트',   maxAgeHours: 30 },
  { key: 'cron:trending-snapshot',  label: '트렌딩 스냅샷',   maxAgeHours: 30 },
  // 매시 실행 — 대부분 skipped:'not_scheduled'로 빠진다. skipped도 "돌았다"로 친다(§4 가드).
  { key: 'cron:competitor-weekly',  label: '경쟁사 주간',     maxAgeHours: 2  },
]
