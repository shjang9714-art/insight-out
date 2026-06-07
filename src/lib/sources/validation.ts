import 'server-only'

import Parser from 'rss-parser'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeUrl } from '@/lib/crawler/normalize'
import {
  isImportSourceType,
  type ParsedSourceRow,
} from '@/lib/sources/import'
import type {
  ImportSourceType,
  SourceImportRow,
  SourceImportSummary,
} from '@/lib/sources/types'

const parser = new Parser()
const FETCH_CONCURRENCY = 5
const FETCH_TIMEOUT_MS = 7_000

interface ValidSourceRow {
  index: number
  name: string
  type: ImportSourceType
  url: string | null
  rssUrl: string
  isActive: boolean
  crawlIntervalMinutes: number
}

interface ValidationResult {
  rows: SourceImportRow[]
  validRows: ValidSourceRow[]
}

function parseBoolean(value: string): boolean | null {
  if (!value) return true
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  return null
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function isYoutubeFeedUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return (
      parsed.hostname.toLowerCase() === 'www.youtube.com' &&
      parsed.pathname === '/feeds/videos.xml' &&
      Boolean(parsed.searchParams.get('channel_id'))
    )
  } catch {
    return false
  }
}

function toResponseRow(
  row: ParsedSourceRow,
  status: SourceImportRow['status'],
  message: string,
  values?: Partial<Pick<SourceImportRow, 'type' | 'is_active' | 'crawl_interval_minutes'>>
): SourceImportRow {
  return {
    index: row.index,
    name: row.name,
    type: values?.type ?? (row.type || 'news_site'),
    rss_url: row.rssUrl,
    is_active: values?.is_active ?? true,
    crawl_interval_minutes: values?.crawl_interval_minutes ?? 720,
    status,
    message,
  }
}

function validateBasicRow(
  row: ParsedSourceRow
): { valid?: ValidSourceRow; result?: SourceImportRow } {
  const type = row.type || 'news_site'
  const isActive = parseBoolean(row.isActiveRaw.toLowerCase())
  const intervalRaw = row.crawlIntervalRaw || '720'
  const interval = Number(intervalRaw)

  if (!row.name) {
    return { result: toResponseRow(row, 'error', '이름은 필수입니다.') }
  }
  if (!isImportSourceType(type)) {
    return {
      result: toResponseRow(
        row,
        'error',
        '유형은 news_site 또는 youtube_channel만 지원합니다.',
        { type }
      ),
    }
  }
  if (!row.rssUrl) {
    return {
      result: toResponseRow(row, 'error', 'RSS URL은 필수입니다.', { type }),
    }
  }
  if (!isHttpUrl(row.rssUrl)) {
    return {
      result: toResponseRow(
        row,
        'error',
        'RSS URL은 http 또는 https 주소여야 합니다.',
        { type }
      ),
    }
  }
  if (row.url && !isHttpUrl(row.url)) {
    return {
      result: toResponseRow(
        row,
        'error',
        '사이트 URL은 http 또는 https 주소여야 합니다.',
        { type }
      ),
    }
  }
  if (type === 'youtube_channel' && !isYoutubeFeedUrl(row.rssUrl)) {
    return {
      result: toResponseRow(
        row,
        'error',
        'YouTube 피드는 www.youtube.com/feeds/videos.xml?channel_id=... 형식이어야 합니다.',
        { type }
      ),
    }
  }
  if (isActive === null) {
    return {
      result: toResponseRow(
        row,
        'error',
        '활성 값은 true, false, 1, 0 중 하나여야 합니다.',
        { type }
      ),
    }
  }
  if (!/^\d+$/.test(intervalRaw) || !Number.isInteger(interval) || interval <= 0) {
    return {
      result: toResponseRow(
        row,
        'error',
        '수집 주기는 양의 정수여야 합니다.',
        { type, is_active: isActive }
      ),
    }
  }

  return {
    valid: {
      index: row.index,
      name: row.name,
      type,
      url: row.url,
      rssUrl: row.rssUrl,
      isActive,
      crawlIntervalMinutes: interval,
    },
  }
}

async function validateFeed(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
        'User-Agent': 'InsightOut/1.0 RSS Validator',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    })

    if (!response.ok) {
      return `피드 요청 실패: HTTP ${response.status}`
    }

    const feed = await parser.parseString(await response.text())
    if (!feed.items || feed.items.length < 1) {
      return '피드에 item 또는 entry가 없습니다.'
    }
    return null
  } catch (error) {
    if (
      error instanceof Error
      && (error.name === 'TimeoutError' || error.name === 'AbortError')
    ) {
      return '피드 검증 시간이 7초를 초과했습니다.'
    }
    console.error(`[sources/import] 피드 파싱 실패 (${url}):`, error)
    return 'RSS 또는 Atom 피드를 파싱할 수 없습니다.'
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await worker(items[currentIndex])
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(FETCH_CONCURRENCY, items.length) },
      () => runWorker()
    )
  )
  return results
}

export async function validateSourceRows(
  admin: SupabaseClient,
  parsedRows: ParsedSourceRow[]
): Promise<ValidationResult> {
  const { data: existingSources, error } = await admin
    .from('sources')
    .select('rss_url')
    .not('rss_url', 'is', null)

  if (error) {
    throw new Error(`기존 소스 조회 실패: ${error.message}`)
  }

  const existingUrls = new Set(
    (existingSources ?? [])
      .map((source) => source.rss_url)
      .filter((url): url is string => typeof url === 'string')
      .map(normalizeUrl)
  )
  const batchUrls = new Set<string>()
  const resultByIndex = new Map<number, SourceImportRow>()
  const candidates: ValidSourceRow[] = []

  for (const row of parsedRows) {
    const basic = validateBasicRow(row)
    if (basic.result) {
      resultByIndex.set(row.index, basic.result)
      continue
    }

    const valid = basic.valid!
    const normalizedRssUrl = normalizeUrl(valid.rssUrl)
    const responseValues = {
      type: valid.type,
      is_active: valid.isActive,
      crawl_interval_minutes: valid.crawlIntervalMinutes,
    }

    if (batchUrls.has(normalizedRssUrl)) {
      resultByIndex.set(
        row.index,
        toResponseRow(row, 'duplicate', '같은 배치에 중복된 RSS URL이 있습니다.', responseValues)
      )
      continue
    }
    batchUrls.add(normalizedRssUrl)

    if (existingUrls.has(normalizedRssUrl)) {
      resultByIndex.set(
        row.index,
        toResponseRow(row, 'duplicate', '이미 등록된 RSS URL입니다.', responseValues)
      )
      continue
    }

    candidates.push(valid)
  }

  const feedResults = await mapWithConcurrency(candidates, async (candidate) => {
    const feedError = await validateFeed(candidate.rssUrl)
    return { candidate, feedError }
  })

  const validRows: ValidSourceRow[] = []
  for (const { candidate, feedError } of feedResults) {
    const parsed = parsedRows.find((row) => row.index === candidate.index)!
    const responseValues = {
      type: candidate.type,
      is_active: candidate.isActive,
      crawl_interval_minutes: candidate.crawlIntervalMinutes,
    }

    if (feedError) {
      resultByIndex.set(
        candidate.index,
        toResponseRow(parsed, 'error', feedError, responseValues)
      )
    } else {
      validRows.push(candidate)
      resultByIndex.set(
        candidate.index,
        toResponseRow(parsed, 'success', '등록할 수 있는 피드입니다.', responseValues)
      )
    }
  }

  return {
    rows: parsedRows.map((row) => resultByIndex.get(row.index)!),
    validRows,
  }
}

export function summarizeSourceImport(rows: SourceImportRow[]): SourceImportSummary {
  return rows.reduce<SourceImportSummary>(
    (summary, row) => {
      summary[row.status] += 1
      return summary
    },
    { success: 0, duplicate: 0, error: 0 }
  )
}

export async function insertValidatedSources(
  admin: SupabaseClient,
  validation: ValidationResult
): Promise<SourceImportRow[]> {
  const validByIndex = new Map(
    validation.validRows.map((row) => [row.index, row])
  )

  return Promise.all(
    validation.rows.map(async (row) => {
      if (row.status !== 'success') return row
      const valid = validByIndex.get(row.index)
      if (!valid) return row

      const { error } = await admin.from('sources').insert({
        name: valid.name,
        type: valid.type,
        url: valid.url,
        rss_url: valid.rssUrl,
        is_active: valid.isActive,
        crawl_interval_minutes: valid.crawlIntervalMinutes,
      })

      if (!error) {
        return { ...row, message: '등록되었습니다.' }
      }
      if (error.code === '23505') {
        return {
          ...row,
          status: 'duplicate' as const,
          message: '등록 중 중복된 RSS URL이 확인되어 건너뛰었습니다.',
        }
      }
      console.error(
        `[sources/import] 소스 등록 실패 (${valid.rssUrl}):`,
        error
      )
      return {
        ...row,
        status: 'error' as const,
        message: '등록 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
      }
    })
  )
}
