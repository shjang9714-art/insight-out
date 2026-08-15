/**
 * 지시서 497 — 크론 "부재" 감지의 유일한 판정 지점.
 *
 * 관측된 job_key 를 순회해서는 부재를 찾을 수 없다(없는 행은 순회 대상에도
 * 안 잡힌다). 그래서 이 맵을 기준으로 detect-issues.ts 가 "기대하는" 잡을
 * 순회하며 마지막 실행을 확인한다.
 *
 * ★이 맵은 vercel.json 의 crons 및 pg_cron 잡과 반드시 일치시켜야 한다.
 *   vercel.json 을 고치면 이 파일도 같이 고쳐라 — 어긋나면 감지가 거짓말을
 *   한다(있는데 없다고 하거나, 없는데 있다고 한다).
 *
 * vercel.json 의 crons 15개(498 — crawl-seeds 추가로 14→15) + pg_cron 전용
 * 1개(vercel.json 에는 없이 순수 pg_cron 10분 주기로만 도는 ops-alert) = 총 16개.
 * body-backfill 은 vercel.json 의 15개 안에 이미 포함돼 있고 pg_cron 10분 주기도
 * 병행할 뿐이라 별도 키로 늘어나지 않는다 — "15 + pg_cron 2개 = 17개"로 세면
 * body-backfill 을 두 번 세는 것이므로 착오다.
 *   - cron:body-backfill: vercel 일 1회(24h) + pg_cron 10분 주기 병행 —
 *     느슨한 쪽(24h)으로 잡는다(자주 도는 쪽 기준으로 잡으면 vercel 경로만
 *     타는 날에도 오탐한다).
 *   - cron:ops-alert: pg_cron 10분 주기(vercel.json 에는 없음) — 마찬가지로
 *     느슨한 쪽(24h).
 *
 * cron:key-insights 는 넣지 않는다 — vercel.json 에 없는 죽은 키(별건 정리 대상).
 */
export const CRON_EXPECTED_INTERVAL_HOURS: Record<string, number> = {
  'cron:crawl': 24,
  'cron:crawl-seeds': 24,
  'cron:summary-backfill': 24,
  'cron:briefing': 24,
  'cron:newsletter': 24,
  'cron:body-backfill': 24, // vercel 일 1회 + pg_cron 10분 주기 병행 — 느슨한 쪽(24)으로 잡는다
  'cron:signals-backfill': 24,
  'cron:ai-refresh': 24,
  'cron:link-health': 24,
  'cron:daily-insights': 24,
  'cron:competitor-weekly': 24, // 매일 돌되 발행 조건 미충족이면 skipped
  'cron:trending-snapshot': 24,
  'cron:event-timeline-refresh': 72,
  'cron:ops-brief': 24,
  'cron:ops-weekly': 168,
  'cron:ops-alert': 24, // pg_cron 10분 주기 — 느슨한 쪽으로
}

/** 부재 판정 배수 — 기대 주기의 이 배수를 넘기면 warning/critical. */
export const CRON_ABSENCE_WARNING_MULTIPLIER = 2
export const CRON_ABSENCE_CRITICAL_MULTIPLIER = 4

/**
 * pg_cron 으로 실제 10분 주기로 도는 잡 — job_runs 에 하루 140행 안팎이
 * 쌓인다. 이 둘을 나머지 14개와 같은 쿼리로 묶으면(항상 최신순이라) 이
 * 둘의 최근 행이 결과를 채워 정작 168시간 주기인 ops-weekly 같은 잡의
 * "5일 전에 실제로 돈" 행이 페이지(기본 1000행) 밖으로 밀려난다 —
 * 497 로컬 검증 중 실제로 재현(4336행 중 최근 1000행만 오고
 * cron:ops-weekly 최신 행이 거기서 잘림). detect-issues.ts 는 이 둘을
 * 최신 1행짜리 별도 쿼리 2개로, 나머지는 시간창을 좁힌 쿼리 1개로 처리한다
 * (총 3개 — 잡 하나당 1개씩인 16개보다는 훨씬 적다).
 */
export const CRON_HIGH_FREQUENCY_KEYS = ['cron:body-backfill', 'cron:ops-alert']
