import 'server-only'

import type { DartCorpCodeEntry } from '@/lib/company-docs/dart-corpcode'

const MAX_CANDIDATES = 5
// "주식회사"/"㈜"/"(주)" 등 법인격 표기와 공백·괄호·가운뎃점 차이는 매칭에서 무시한다.
const CORP_SUFFIX_PATTERN = /(주식회사|㈜|\(주\))/g
const STRIP_PATTERN = /[\s().·]/g

export function normalizeCompanyName(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(CORP_SUFFIX_PATTERN, '')
    .replace(STRIP_PATTERN, '')
    .toLowerCase()
}

export interface MatchCandidate {
  corpCode: string
  corpName: string
  listed: boolean
}

export interface CuratedCompanyInput {
  entityId: string
  name: string
  aliases: string[]
}

export type CompanyMatchStatus = 'matched' | 'candidates' | 'no-candidates'

export interface CompanyMatchResult {
  entityId: string
  name: string
  status: CompanyMatchStatus
  matched: MatchCandidate | null
  /** status='candidates'일 때만 채워짐(자동 저장 금지, 화면 표시용) */
  candidates: MatchCandidate[]
}

function toCandidate(entry: DartCorpCodeEntry): MatchCandidate {
  return { corpCode: entry.corpCode, corpName: entry.corpName, listed: Boolean(entry.stockCode) }
}

/**
 * 큐레이션 기업(name·aliases)을 DART corpCode 전체목록과 정규화 매칭한다.
 * 완전일치 우선(단일 매치 또는 다중 매치 중 상장사 유일)만 자동 등록 대상('matched')으로
 * 판정하고, 그 외(다중 후보·부분일치만 있음)는 'candidates'로 화면 표시만 한다.
 * 어떤 후보도 없으면(글로벌·비상장 등) 'no-candidates'.
 */
export function matchCuratedCompanies(
  companies: CuratedCompanyInput[],
  corpEntries: DartCorpCodeEntry[],
): CompanyMatchResult[] {
  const exactIndex = new Map<string, DartCorpCodeEntry[]>()
  for (const entry of corpEntries) {
    const key = normalizeCompanyName(entry.corpName)
    if (!key) continue
    const bucket = exactIndex.get(key)
    if (bucket) bucket.push(entry)
    else exactIndex.set(key, [entry])
  }

  return companies.map((company) => {
    const variants = [...new Set(
      [company.name, ...company.aliases]
        .map(normalizeCompanyName)
        .filter((value) => value.length >= 2)
    )]

    const exactByCode = new Map<string, DartCorpCodeEntry>()
    for (const variant of variants) {
      for (const entry of exactIndex.get(variant) ?? []) {
        exactByCode.set(entry.corpCode, entry)
      }
    }
    const exactMatches = [...exactByCode.values()]

    if (exactMatches.length === 1) {
      return {
        entityId: company.entityId, name: company.name,
        status: 'matched', matched: toCandidate(exactMatches[0]), candidates: [],
      }
    }
    if (exactMatches.length > 1) {
      const listed = exactMatches.filter((entry) => entry.stockCode)
      if (listed.length === 1) {
        return {
          entityId: company.entityId, name: company.name,
          status: 'matched', matched: toCandidate(listed[0]), candidates: [],
        }
      }
      return {
        entityId: company.entityId, name: company.name,
        status: 'candidates', matched: null,
        candidates: exactMatches.slice(0, MAX_CANDIDATES).map(toCandidate),
      }
    }

    // 완전일치 없음 — 참고용 부분일치만 탐색(자동 저장 금지).
    const primary = variants[0]
    const partial: DartCorpCodeEntry[] = []
    if (primary) {
      for (const entry of corpEntries) {
        const normalized = normalizeCompanyName(entry.corpName)
        if (!normalized) continue
        if (normalized.includes(primary) || primary.includes(normalized)) {
          partial.push(entry)
          if (partial.length >= MAX_CANDIDATES) break
        }
      }
    }

    if (partial.length === 0) {
      return { entityId: company.entityId, name: company.name, status: 'no-candidates', matched: null, candidates: [] }
    }
    return {
      entityId: company.entityId, name: company.name,
      status: 'candidates', matched: null, candidates: partial.map(toCandidate),
    }
  })
}
