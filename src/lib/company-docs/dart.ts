import 'server-only'

import type { CompanyDocumentGroup, CompanyDocumentType } from '@/lib/types'

const DART_LIST_URL = 'https://opendart.fss.or.kr/api/list.json'
const DART_VIEWER_URL = 'https://dart.fss.or.kr/dsaf001/main.do'
const PAGE_SIZE = 100
const MAX_PAGES_PER_TYPE = 50
const PERIODIC_REPORT_PATTERN = /(사업|분기|반기)보고서/

interface DartListItem {
  rcept_no?: unknown
  report_nm?: unknown
  rcept_dt?: unknown
  flr_nm?: unknown
}

interface DartListResponse {
  status?: unknown
  message?: unknown
  page_no?: unknown
  total_page?: unknown
  list?: unknown
}

export interface DartDisclosure {
  rceptNo: string
  reportName: string
  receivedOn: string
  filerName: string
  disclosureType: 'A' | 'B'
}

export interface NormalizedDartDocument {
  rceptNo: string
  title: string
  author: string
  publishedOn: string
  originalUrl: string
  docType: CompanyDocumentType
  docGroup: CompanyDocumentGroup
  isOfficial: true
  sourceKind: 'API'
  officialStatus: '공식원문링크'
}

export interface DartFetchResult {
  disclosures: DartDisclosure[]
  skipped: boolean
  message: string | null
}

export class DartApiError extends Error {
  constructor(
    message: string,
    readonly statusCode?: string,
  ) {
    super(message)
    this.name = 'DartApiError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asPositiveInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function formatRequestDate(value: string): string {
  const compact = value.replaceAll('-', '')
  if (!/^\d{8}$/.test(compact)) {
    throw new Error('DART 수집 시작일은 YYYY-MM-DD 형식이어야 합니다.')
  }
  return compact
}

function formatPublishedOn(value: string): string {
  if (!/^\d{8}$/.test(value)) return value
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
}

function currentKstDate(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()).replaceAll('-', '')
}

function parseItem(value: unknown, disclosureType: 'A' | 'B'): DartDisclosure | null {
  if (!isRecord(value)) return null
  const item = value as DartListItem
  const rceptNo = asString(item.rcept_no)
  const reportName = asString(item.report_nm)
  const receivedOn = asString(item.rcept_dt)
  if (!/^\d{14}$/.test(rceptNo) || !reportName || !/^\d{8}$/.test(receivedOn)) {
    return null
  }
  return {
    rceptNo,
    reportName,
    receivedOn,
    filerName: asString(item.flr_nm),
    disclosureType,
  }
}

async function fetchDisclosureType(
  apiKey: string,
  corpCode: string,
  since: string,
  disclosureType: 'A' | 'B',
): Promise<DartDisclosure[]> {
  const disclosures: DartDisclosure[] = []

  for (let page = 1; page <= MAX_PAGES_PER_TYPE; page += 1) {
    const searchParams = new URLSearchParams({
      crtfc_key: apiKey,
      corp_code: corpCode,
      bgn_de: since,
      end_de: currentKstDate(),
      pblntf_ty: disclosureType,
      sort: 'date',
      sort_mth: 'desc',
      page_no: String(page),
      page_count: String(PAGE_SIZE),
    })
    const response = await fetch(`${DART_LIST_URL}?${searchParams.toString()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      throw new DartApiError(`OpenDART가 HTTP ${response.status} 오류를 반환했습니다.`)
    }

    const raw: unknown = await response.json()
    if (!isRecord(raw)) throw new DartApiError('OpenDART 응답 형식이 올바르지 않습니다.')
    const data = raw as DartListResponse
    const status = asString(data.status)
    const message = asString(data.message)

    // 013은 정상적인 조회 결과 없음 코드다.
    if (status === '013') return disclosures
    if (status !== '000') {
      const prefix = status === '020' ? 'OpenDART 요청 한도를 초과했습니다.' : 'OpenDART 조회에 실패했습니다.'
      throw new DartApiError(`${prefix}${message ? ` ${message}` : ''}`, status)
    }

    const list = Array.isArray(data.list) ? data.list : []
    for (const value of list) {
      const parsed = parseItem(value, disclosureType)
      if (parsed) disclosures.push(parsed)
    }

    const totalPages = asPositiveInteger(data.total_page, 1)
    const currentPage = asPositiveInteger(data.page_no, page)
    if (currentPage >= totalPages) break
    if (page === MAX_PAGES_PER_TYPE) {
      throw new DartApiError('OpenDART 조회 결과가 안전 페이지 한도를 초과했습니다. 수집 기간을 줄여주세요.')
    }
  }

  return disclosures
}

/**
 * 기업의 정기공시(A)와 주요사항보고(B)를 조회한다.
 * 키가 없으면 배포·빌드를 막지 않고 명확한 no-op 결과를 반환한다.
 */
export async function fetchDisclosures(corpCode: string, since: string): Promise<DartFetchResult> {
  if (!/^\d{8}$/.test(corpCode)) {
    throw new Error('DART 고유번호는 8자리 숫자여야 합니다.')
  }
  const apiKey = process.env.OPENDART_API_KEY?.trim()
  if (!apiKey) {
    return {
      disclosures: [],
      skipped: true,
      message: 'OPENDART_API_KEY가 설정되지 않아 DART 수집을 실행하지 않았습니다.',
    }
  }

  const requestDate = formatRequestDate(since)
  const [periodic, major] = await Promise.all([
    fetchDisclosureType(apiKey, corpCode, requestDate, 'A'),
    fetchDisclosureType(apiKey, corpCode, requestDate, 'B'),
  ])
  const selected = [
    ...periodic.filter((item) => PERIODIC_REPORT_PATTERN.test(item.reportName)),
    ...major,
  ]
  const unique = new Map(selected.map((item) => [item.rceptNo, item]))

  return {
    disclosures: [...unique.values()].sort((a, b) => b.receivedOn.localeCompare(a.receivedOn)),
    skipped: false,
    message: null,
  }
}

/** OpenDART 행을 contents/company_documents 공통 적재 모델로 정규화한다. */
export function normalizeDisclosure(disclosure: DartDisclosure): NormalizedDartDocument {
  const isPeriodic = disclosure.disclosureType === 'A'
  return {
    rceptNo: disclosure.rceptNo,
    title: disclosure.reportName,
    author: disclosure.filerName,
    publishedOn: formatPublishedOn(disclosure.receivedOn),
    originalUrl: `${DART_VIEWER_URL}?rcpNo=${encodeURIComponent(disclosure.rceptNo)}`,
    docType: isPeriodic ? 'IR·실적' : '전략·보고서',
    docGroup: '투자및경영',
    isOfficial: true,
    sourceKind: 'API',
    officialStatus: '공식원문링크',
  }
}
