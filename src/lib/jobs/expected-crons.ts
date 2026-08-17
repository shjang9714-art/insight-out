// 292 — key 목록은 vercel.json 이 단일 진실. 여기서는 label/maxAgeHours 만 관리한다.
// (감지 장치의 핵심: 여기 빠진 크론은 "계측 안 됨"으로 드러나지 않는다 — §4 회귀 가드 참고)
//
// vercel.json 에 크론을 추가/제거하면 이 파일의 CRON_META 도 맞춰야 한다.
// 맞추지 않으면 아래에서 즉시 throw 되어 빌드/기동 시점에 드러난다 — 손으로 대조할 필요 없음.
import vercelConfig from '../../../vercel.json'

export interface ExpectedCron {
  key: string
  label: string
  /** 이 시간 안에 어떤 기록이든(succeeded/skipped/failed) 있어야 정상. */
  maxAgeHours: number
  /** 499 — pg_cron 10분 주기라 job_runs 가 하루 140행 안팎 쌓인다.
   *  부재 판정 시 벌크 쿼리에서 떼어내 별도 조회해야 한다(497 §페이지 상한 참고). */
  highFrequency?: boolean
}

interface CronMeta {
  label: string
  maxAgeHours: number
  /** 499 — pg_cron 10분 주기라 job_runs 가 하루 140행 안팎 쌓인다.
   *  부재 판정 시 벌크 쿼리에서 떼어내 별도 조회해야 한다(497 §페이지 상한 참고). */
  highFrequency?: boolean
  /** 499 — vercel.json 에 없이 pg_cron 으로만 도는 크론. */
  pgCronOnly?: boolean
}

// vercel.json 에 없는 크론의 메타는 여기 남아 있어도 무해하다(사용되지 않을 뿐).
// 반대로 vercel.json 에 있는데 여기 없으면 아래에서 throw.
const CRON_META: Record<string, CronMeta> = {
  'cron:crawl':               { label: '크롤',            maxAgeHours: 30 },
  // 498 — 크롤 크론 분리(소스 폴링 cron:crawl / 키워드·회사 seed 검색 cron:crawl-seeds)
  'cron:crawl-seeds':         { label: '크롤(seed 검색)',  maxAgeHours: 30 },
  'cron:summary-backfill':    { label: '요약 백필',        maxAgeHours: 30 },
  'cron:briefing':            { label: '모닝브리핑',       maxAgeHours: 30 },
  'cron:newsletter':          { label: '뉴스레터',         maxAgeHours: 30 },
  // vercel 일 1회 + pg_cron 10분 주기 병행(499) — highFrequency 는 부재 판정 쿼리 분리용.
  'cron:body-backfill':       { label: '본문 수집',        maxAgeHours: 30, highFrequency: true },
  'cron:signals-backfill':    { label: '신호 분류',        maxAgeHours: 30 },
  'cron:ai-refresh':          { label: 'AI 갱신',          maxAgeHours: 30 },
  'cron:link-health':         { label: '링크 헬스',        maxAgeHours: 30 },
  'cron:daily-insights':      { label: '일일 인사이트',    maxAgeHours: 30 },
  'cron:trending-snapshot':   { label: '트렌딩 스냅샷',    maxAgeHours: 30 },
  // vercel.json 은 "0 21 * * *"(일 1회) — 499: 과거 매시 스케줄 시절 주석/값(2)이 남아있던
  // 걸 현재 스케줄에 맞게 정정. job_runs 실측(8/10~8/14)도 하루 한 번씩이다.
  'cron:competitor-weekly':   { label: '경쟁사 주간',      maxAgeHours: 30 },
  // 3일 주기(지시서 C) — 여유 두어 78시간(3.25일)
  'cron:event-timeline-refresh': { label: '사건 타임라인 갱신', maxAgeHours: 78 },
  'cron:ops-brief':            { label: '일일 운영 브리핑',    maxAgeHours: 30 },
  'cron:ops-weekly':           { label: '주간 운영 리포트',    maxAgeHours: 200 },
  // 499 — vercel.json 에는 없이 pg_cron 10분 주기로만 도는 운영 알림. 429/434 참고.
  'cron:ops-alert':            { label: '운영 알림',           maxAgeHours: 30, highFrequency: true, pgCronOnly: true },
}

function cronKeyFromPath(path: string): string {
  const match = path.match(/^\/api\/cron\/(.+)$/)
  if (!match) {
    throw new Error(`vercel.json 의 크론 경로 형식이 예상과 다릅니다: ${path} (기대: /api/cron/{name})`)
  }
  return `cron:${match[1]}`
}

function toExpectedCron(key: string, meta: CronMeta): ExpectedCron {
  return { key, label: meta.label, maxAgeHours: meta.maxAgeHours, highFrequency: meta.highFrequency }
}

const vercelCrons: ExpectedCron[] = (vercelConfig.crons as Array<{ path: string }>).map((cron) => {
  const key = cronKeyFromPath(cron.path)
  const meta = CRON_META[key]
  if (!meta) {
    throw new Error(
      `vercel.json 에 '${key}' 크론이 있는데 src/lib/jobs/expected-crons.ts 의 CRON_META 에 label/maxAgeHours 가 없습니다. `
      + `크론을 추가했다면 CRON_META 도 같이 갱신하세요.`
    )
  }
  return toExpectedCron(key, meta)
})

// 499 — vercel.json 파생분(위) + pgCronOnly 항목(pg_cron 으로만 도는 크론, vercel.json 에
// 없어 위 파생 대상에 안 잡힘)의 합집합. cron:key-insights 처럼 CRON_META 에 남아 있어도
// pgCronOnly 가 아니고 vercel.json 에도 없는 죽은 키는 여기 섞이지 않는다.
const pgCronOnlyCrons: ExpectedCron[] = Object.entries(CRON_META)
  .filter(([, meta]) => meta.pgCronOnly)
  .map(([key, meta]) => toExpectedCron(key, meta))

export const EXPECTED_CRONS: ExpectedCron[] = [...vercelCrons, ...pgCronOnlyCrons]
