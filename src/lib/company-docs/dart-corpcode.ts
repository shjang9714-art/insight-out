import 'server-only'

import { inflateRawSync } from 'node:zlib'

const CORPCODE_URL = 'https://opendart.fss.or.kr/api/corpCode.xml'
// corpCode.xml은 수 MB·수십만 건이라 매 요청 재다운로드 금지 — 24시간 메모리 캐시.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

export interface DartCorpCodeEntry {
  corpCode: string
  corpName: string
  /** 상장사만 값이 있음(비상장은 null) — 동명이인 후보 중 상장사 우선 판정에 사용. */
  stockCode: string | null
}

export interface CorpCodeLoadResult {
  entries: DartCorpCodeEntry[]
  skipped: boolean
  message: string | null
}

interface CorpCodeCache {
  fetchedAt: number
  entries: DartCorpCodeEntry[]
}

// 서버 프로세스 생존 기간 동안 유지되는 모듈 레벨 캐시(요청 간 공유).
let cache: CorpCodeCache | null = null
let inFlight: Promise<DartCorpCodeEntry[]> | null = null

// ─── 최소 ZIP 리더 ────────────────────────────────────────────────────────────
// OPENDART corpCode.xml은 ZIP 컨테이너 안에 CORPCODE.xml 하나만 담아 응답한다.
// 외부 unzip 의존성을 추가하지 않고, 표준 ZIP 포맷의 End-of-Central-Directory →
// 중앙 디렉터리 순으로 파싱해 항목의 정확한 오프셋·크기를 얻는다(로컬 헤더의
// 크기 필드는 스트리밍 ZIP에서 0일 수 있어 신뢰하지 않는다).
function findEndOfCentralDirectory(buffer: Buffer): number {
  const EOCD_SIGNATURE = 0x06054b50
  const minOffset = Math.max(0, buffer.length - 65_557) // EOCD(22B) + 최대 코멘트 64KB
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset
  }
  throw new Error('ZIP 파일에서 End of Central Directory를 찾지 못했습니다.')
}

function extractFirstXmlEntry(buffer: Buffer): Buffer {
  const eocdOffset = findEndOfCentralDirectory(buffer)
  const entryCount = buffer.readUInt16LE(eocdOffset + 10)
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16)

  let offset = centralDirOffset
  for (let i = 0; i < entryCount; i += 1) {
    const signature = buffer.readUInt32LE(offset)
    if (signature !== 0x02014b50) {
      throw new Error('ZIP 중앙 디렉터리 헤더가 올바르지 않습니다.')
    }
    const compressionMethod = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const fileNameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localHeaderOffset = buffer.readUInt32LE(offset + 42)
    const fileName = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLength)

    if (fileName.toLowerCase().endsWith('.xml')) {
      const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26)
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28)
      const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength
      const compressed = buffer.subarray(dataStart, dataStart + compressedSize)
      return compressionMethod === 0 ? Buffer.from(compressed) : inflateRawSync(compressed)
    }

    offset += 46 + fileNameLength + extraLength + commentLength
  }
  throw new Error('ZIP 안에서 XML 파일을 찾지 못했습니다.')
}

// ─── CORPCODE.xml 파싱 ────────────────────────────────────────────────────────
// 형식: <result><list><corp_code/><corp_name/><stock_code/><modify_date/></list>...</result>
// 중첩·속성이 없는 평탄한 구조라 전용 XML 파서 없이 정규식으로 충분히 안전하게 파싱한다.

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function extractTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return match ? decodeXmlEntities(match[1].trim()) : ''
}

function parseCorpCodeXml(xml: string): DartCorpCodeEntry[] {
  const entries: DartCorpCodeEntry[] = []
  const blocks = xml.match(/<list>[\s\S]*?<\/list>/g) ?? []
  for (const block of blocks) {
    const corpCode = extractTag(block, 'corp_code')
    const corpName = extractTag(block, 'corp_name')
    const stockCode = extractTag(block, 'stock_code')
    if (/^\d{8}$/.test(corpCode) && corpName) {
      entries.push({ corpCode, corpName, stockCode: stockCode || null })
    }
  }
  return entries
}

async function downloadAndParse(apiKey: string): Promise<DartCorpCodeEntry[]> {
  const response = await fetch(`${CORPCODE_URL}?crtfc_key=${encodeURIComponent(apiKey)}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    throw new Error(`OpenDART corpCode.xml 요청이 HTTP ${response.status}를 반환했습니다.`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())

  // 키 오류 등은 ZIP이 아니라 JSON({status, message})으로 온다 — ZIP 시그니처(PK)로 우선 구분.
  if (buffer.subarray(0, 2).toString('latin1') !== 'PK') {
    let message = 'OpenDART corpCode 응답이 ZIP 형식이 아닙니다.'
    try {
      const parsed = JSON.parse(buffer.toString('utf8')) as { status?: string; message?: string }
      if (parsed.message) message = `OpenDART 오류: ${parsed.message}`
    } catch {
      // JSON도 아니면 위 기본 메시지 유지
    }
    throw new Error(message)
  }

  const xml = extractFirstXmlEntry(buffer).toString('utf8')
  return parseCorpCodeXml(xml)
}

/**
 * OPENDART corpCode 전체목록(고유번호·회사명·종목코드)을 24시간 캐시로 로드한다.
 * 키가 없으면 배포·빌드를 막지 않고 명확한 no-op 결과를 반환한다.
 */
export async function loadDartCorpCodes(): Promise<CorpCodeLoadResult> {
  const apiKey = process.env.OPENDART_API_KEY?.trim()
  if (!apiKey) {
    return {
      entries: [],
      skipped: true,
      message: 'OPENDART_API_KEY가 설정되지 않아 corpCode 조회를 실행하지 않았습니다.',
    }
  }

  const now = Date.now()
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return { entries: cache.entries, skipped: false, message: null }
  }

  if (!inFlight) {
    inFlight = downloadAndParse(apiKey).finally(() => {
      inFlight = null
    })
  }

  try {
    const entries = await inFlight
    cache = { fetchedAt: now, entries }
    return { entries, skipped: false, message: null }
  } catch (error) {
    // 캐시가 남아 있으면(만료됐어도) 폴백 — 일시적 장애로 기능 전체를 막지 않는다.
    if (cache) {
      return { entries: cache.entries, skipped: false, message: null }
    }
    throw error
  }
}
