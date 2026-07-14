import 'server-only'
import type {
  CompetitorWeeklySection,
  WeeklyAsymmetry,
  WeeklyEvent,
  WeeklyIntent,
  WeeklyOption,
  WeeklyStatusPoint,
  WeeklyWatchMetric,
} from '@/lib/competitor-weekly/query'

/**
 * 348 패스③ — 근거 검증(자동, 저장 직전).
 *
 * 패스②(Claude MCP 수동)가 만든 해석을 그대로 믿지 않는다.
 * 근거(evidence)가 없거나, 존재하지 않는 사건(evt_id)을 가리키는 문장은 **저장하지 않는다**.
 * 이 단계가 없으면 "약 392조 원 투자" 같은 근거 없는 수치가 그대로 발행된다.
 */

export type ImpactValue = '위기' | '기회' | '관망'
const IMPACT_VALUES: ImpactValue[] = ['위기', '기회', '관망']

export function isImpactValue(v: unknown): v is ImpactValue {
  return typeof v === 'string' && (IMPACT_VALUES as string[]).includes(v)
}

/** 패스② import 페이로드(영역 1개분) */
export interface AnalysisInput {
  area_key: string
  impact: unknown
  overview?: unknown
  status_points?: unknown
  intents?: unknown
  conflict_areas?: unknown
  asymmetry?: unknown
  options?: unknown
  watch_metrics?: unknown
}

export interface VerifyReport {
  /** 검증에서 제외된 항목 — 어드민에 그대로 노출한다 */
  dropped: { area: string; slot: string; text: string; reason: string }[]
  /** 근거 없는 수치 — 드롭하지 않고 경고만 */
  warnings: { area: string; slot: string; text: string; reason: string }[]
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : []

/** 서술문에 등장하는 수치 토큰(5조, 15GW, 392조 원 …) */
const NUMBER_TOKEN = /\d[\d,.]*\s*(?:조|억|만|GW|MW|kW|%|건|명|년|월)/g

function collectEvidenceNumbers(events: WeeklyEvent[]): string {
  return events
    .map(e => `${e.event} ${Object.values(e.numbers ?? {}).join(' ')}`)
    .join(' ')
    .replace(/\s+/g, '')
}

// ─── 검증 ─────────────────────────────────────────────────────────────────────

/**
 * 영역 1개분 분석을 검증해 저장 가능한 슬롯만 남긴다.
 * @param section 패스①까지 채워진 섹션(events 포함)
 * @param input   패스② 산출물
 */
export function verifyAnalysis(
  section: CompetitorWeeklySection,
  input: AnalysisInput,
  report: VerifyReport,
): CompetitorWeeklySection {
  const area = section.area_label
  const events = section.events ?? []
  const validIds = new Set(events.map(e => e.id))
  const evidenceText = collectEvidenceNumbers(events)

  const drop = (slot: string, text: string, reason: string) => {
    report.dropped.push({ area, slot, text, reason })
  }

  /** 근거는 일부만 유효해도 통과시키지 않는다. 잘못된 evt_id가 하나라도 있으면 해당 문장을 버린다. */
  const resolveEvidence = (v: unknown): { evidence: string[]; reason: string | null } => {
    const evidence = strArr(v)
    if (evidence.length === 0) return { evidence: [], reason: '근거(evidence) 없음' }
    const invalidIds = evidence.filter(id => !validIds.has(id))
    if (invalidIds.length > 0) {
      return { evidence: [], reason: `존재하지 않는 사건 참조: ${invalidIds.join(', ')}` }
    }
    return { evidence, reason: null }
  }

  /** 서술문의 수치가 근거에 없으면 경고 */
  const checkNumbers = (slot: string, text: string) => {
    for (const token of text.match(NUMBER_TOKEN) ?? []) {
      const normalized = token.replace(/\s+/g, '')
      if (!evidenceText.includes(normalized)) {
        report.warnings.push({ area, slot, text: token, reason: '근거 사건에 없는 수치' })
      }
    }
  }

  // 현황
  const statusPoints: WeeklyStatusPoint[] = []
  for (const raw of Array.isArray(input.status_points) ? input.status_points : []) {
    const o = (raw ?? {}) as Record<string, unknown>
    const thesis = str(o.thesis)
    const detail = str(o.detail)
    const { evidence, reason } = resolveEvidence(o.evidence)
    if (!thesis) continue
    if (reason) {
      drop('현황', thesis, reason)
      continue
    }
    checkNumbers('현황', `${thesis} ${detail}`)
    statusPoints.push({ thesis, detail, evidence })
  }

  // 의도 분석
  const intents: WeeklyIntent[] = []
  for (const raw of Array.isArray(input.intents) ? input.intents : []) {
    const o = (raw ?? {}) as Record<string, unknown>
    const actor = str(o.actor)
    const seeking = str(o.seeking)
    const reading = str(o.reading)
    const { evidence, reason } = resolveEvidence(o.evidence)
    if (!actor || !reading) continue
    if (reason) {
      drop('의도 분석', `${actor} — ${reading}`, reason)
      continue
    }
    checkNumbers('의도 분석', reading)
    intents.push({ actor, seeking, reading, evidence })
  }

  // 비대칭
  let asymmetry: WeeklyAsymmetry | undefined
  if (input.asymmetry && typeof input.asymmetry === 'object') {
    const o = input.asymmetry as Record<string, unknown>
    const theirs = str(o.theirs)
    const ours = str(o.ours)
    const { evidence, reason } = resolveEvidence(o.evidence)
    if (theirs && ours) {
      if (reason) {
        drop('비대칭', theirs, reason)
      } else {
        checkNumbers('비대칭', `${theirs} ${ours}`)
        asymmetry = { theirs, ours, evidence }
      }
    }
  }

  // 대응 옵션 — 해석의 결론이므로 evidence 를 요구하지 않는다(근거는 위 슬롯이 이미 진다)
  const options: WeeklyOption[] = []
  for (const raw of Array.isArray(input.options) ? input.options : []) {
    const o = (raw ?? {}) as Record<string, unknown>
    const action = str(o.action)
    if (!action) continue
    const cost = o.cost === '상' || o.cost === '중' || o.cost === '하' ? o.cost : undefined
    options.push({ action, rationale: str(o.rationale), cost })
  }

  // 지켜볼 지표 — if_then 이 없으면 반증 불가능한 문장이므로 버린다
  const watchMetrics: WeeklyWatchMetric[] = []
  for (const raw of Array.isArray(input.watch_metrics) ? input.watch_metrics : []) {
    const o = (raw ?? {}) as Record<string, unknown>
    const metric = str(o.metric)
    const ifThen = str(o.if_then)
    if (!metric) continue
    if (!ifThen) {
      drop('지켜볼 지표', metric, 'if_then 없음 — 반증 가능한 형태가 아님')
      continue
    }
    watchMetrics.push({ metric, if_then: ifThen, due: str(o.due) || undefined })
  }

  const impact: ImpactValue = isImpactValue(input.impact) ? input.impact : '관망'

  return {
    ...section,
    impact,
    overview: str(input.overview) || undefined,
    status_points: statusPoints.length > 0 ? statusPoints : undefined,
    intents: intents.length > 0 ? intents : undefined,
    conflict_areas: strArr(input.conflict_areas),
    asymmetry,
    options: options.length > 0 ? options : undefined,
    watch_metrics: watchMetrics.length > 0 ? watchMetrics : undefined,
    // 레거시 필드는 렌더 폴백용으로 유지 — 분석이 들어오면 implication 은 첫 옵션으로 채운다
    implication: options[0]?.action ?? section.implication,
  }
}
