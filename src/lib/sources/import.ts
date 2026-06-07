import 'server-only'

import type {
  ImportSourceType,
  SourceImportFormat,
} from '@/lib/sources/types'

const KNOWN_COLUMNS = [
  'name',
  'type',
  'url',
  'rss_url',
  'is_active',
  'crawl_interval_minutes',
] as const

type KnownColumn = (typeof KNOWN_COLUMNS)[number]

export interface ParsedSourceRow {
  index: number
  name: string
  type: string
  url: string | null
  rssUrl: string
  isActiveRaw: string
  crawlIntervalRaw: string
}

export class SourceImportParseError extends Error {}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      row.push(cell)
      cell = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }

    cell += char
  }

  if (inQuotes) {
    throw new SourceImportParseError('CSV 따옴표가 닫히지 않았습니다.')
  }

  row.push(cell)
  rows.push(row)
  return rows
}

function parseTsv(text: string): string[][] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.split('\t'))
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

function isBlankRow(row: string[]): boolean {
  return row.every((cell) => cell.trim() === '')
}

function resolveFormat(
  text: string,
  requestedFormat: SourceImportFormat
): Exclude<SourceImportFormat, 'auto'> {
  if (requestedFormat !== 'auto') return requestedFormat

  const firstNonBlankLine =
    text.replace(/^\uFEFF/, '').split(/\r?\n/).find((line) => line.trim()) ?? ''
  return firstNonBlankLine.includes('\t') ? 'tsv' : 'csv'
}

function readMappedCell(
  row: string[],
  headerMap: Map<KnownColumn, number>,
  column: KnownColumn
): string {
  const index = headerMap.get(column)
  return index === undefined ? '' : (row[index] ?? '').trim()
}

export function parseSourceImport(
  text: string,
  format: SourceImportFormat = 'auto'
): ParsedSourceRow[] {
  const normalizedText = text.replace(/^\uFEFF/, '')
  if (!normalizedText.trim()) {
    throw new SourceImportParseError('등록할 CSV 또는 TSV 내용을 입력해주세요.')
  }

  const resolvedFormat = resolveFormat(normalizedText, format)
  const parsedRows = (
    resolvedFormat === 'tsv'
      ? parseTsv(normalizedText)
      : parseCsv(normalizedText)
  ).filter((row) => !isBlankRow(row))

  if (parsedRows.length === 0) {
    throw new SourceImportParseError('등록할 데이터 행이 없습니다.')
  }

  const firstRowHeaders = parsedRows[0].map(normalizeHeader)
  const hasHeader = firstRowHeaders.some((cell) =>
    KNOWN_COLUMNS.includes(cell as KnownColumn)
  )
  const dataRows = hasHeader ? parsedRows.slice(1) : parsedRows

  if (dataRows.length === 0) {
    throw new SourceImportParseError('등록할 데이터 행이 없습니다.')
  }

  if (dataRows.length > 50) {
    throw new SourceImportParseError(
      `한 번에 최대 50행까지 등록할 수 있습니다. 현재 ${dataRows.length}행입니다.`
    )
  }

  const headerMap = new Map<KnownColumn, number>()
  if (hasHeader) {
    firstRowHeaders.forEach((header, index) => {
      if (KNOWN_COLUMNS.includes(header as KnownColumn)) {
        headerMap.set(header as KnownColumn, index)
      }
    })
  }

  return dataRows.map((row, rowIndex) => {
    if (hasHeader) {
      return {
        index: rowIndex + 2,
        name: readMappedCell(row, headerMap, 'name'),
        type: readMappedCell(row, headerMap, 'type'),
        url: readMappedCell(row, headerMap, 'url') || null,
        rssUrl: readMappedCell(row, headerMap, 'rss_url'),
        isActiveRaw: readMappedCell(row, headerMap, 'is_active'),
        crawlIntervalRaw: readMappedCell(
          row,
          headerMap,
          'crawl_interval_minutes'
        ),
      }
    }

    return {
      index: rowIndex + 1,
      name: (row[0] ?? '').trim(),
      type: (row[1] ?? '').trim(),
      url: null,
      rssUrl: (row[2] ?? '').trim(),
      isActiveRaw: (row[3] ?? '').trim(),
      crawlIntervalRaw: (row[4] ?? '').trim(),
    }
  })
}

export function isImportSourceType(value: string): value is ImportSourceType {
  return value === 'news_site' || value === 'youtube_channel'
}
