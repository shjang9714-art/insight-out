// 지시서 20260827b — 근거기사 "같은 사건 보도" 그룹핑. 완전일치 dedup(dedupeSourceArticles.ts)을
// 통과한 배열을 입력으로 받아, 같은 사건을 다룬 서로 다른 기사를 대표 1건 + others로 묶는다.
// ⚠️ 대전제: 숨기지 않는다 — 접기 UI가 펼치면 others가 전부 그대로 나온다. 판정이 틀려도
// 기사가 사라지지 않는다는 전제로 임계값을 공격적으로 잡는다. DB/서버 의존 없는 순수 함수,
// 결정론, 어떤 입력에도 throw 하지 않는다.

import { normalizeTitle } from './dedupeSourceArticles.ts'

export interface GroupableArticle {
  content_id?: string | null
  title?: string | null
  url?: string | null
  source?: string | null
  published_at?: string | null
}

export interface SameEventGroup<T> {
  representative: T
  others: T[]
}

/** 발행일 근접 판정 기준(A) — ±1일 이내. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000

/** 시그니처 유사도 임계값(B) — 시작값 0.45. 튜닝 시 여기만 바꾸면 됨. */
export const SAME_EVENT_MIN_JACCARD = 0.45

/**
 * 시그니처 토큰에서 제외할 일반어 — 숫자/서수 토큰은 코드로 별도 제외(§1-1의 숫자 포함 토큰 규칙),
 * 여기는 사건 변별력이 없는 동사·접속어만. 튜닝 가능하도록 상수로 분리.
 */
const SIGNATURE_STOPWORDS = new Set([
  '발표', '출시', '공개', '확대', '추진', '도입', '운영', '개막', '착공', '이유', '여는', '연다',
  '나선다', '밝혀', '후원', '상영작', '관련', '통해', '위해', '첫', '등', '및', '신규', '계획', '예정', '지원',
])

/**
 * 주체 회사 사전 — 표기 변형은 alias 배열로. C(회사명 가드) 판정에 쓴다.
 * 짧은 영문 약어(KT, MS 등)는 오탐 방지를 위해 단어 경계 매칭한다.
 */
const COMPANY_DICTIONARY: { canonical: string; aliases: string[] }[] = [
  { canonical: 'SK텔레콤', aliases: ['SK텔레콤', 'SKT'] },
  { canonical: 'SK브로드밴드', aliases: ['SK브로드밴드', 'SKB'] },
  { canonical: 'KT', aliases: ['KT'] },
  { canonical: 'LG유플러스', aliases: ['LG유플러스', 'LGU+', 'LG U+'] },
  { canonical: '삼성', aliases: ['삼성', '삼성전자'] },
  { canonical: '네이버', aliases: ['네이버', 'NAVER'] },
  { canonical: '카카오', aliases: ['카카오'] },
  { canonical: '쿠팡', aliases: ['쿠팡'] },
  { canonical: 'NHN', aliases: ['NHN'] },
  { canonical: '엔비디아', aliases: ['엔비디아', 'NVIDIA'] },
  { canonical: '구글', aliases: ['구글', 'Google'] },
  { canonical: '아마존', aliases: ['아마존', 'AWS', 'Amazon'] },
  { canonical: '마이크로소프트', aliases: ['마이크로소프트', 'MS', 'Microsoft'] },
  { canonical: '메타', aliases: ['메타', 'Meta'] },
  { canonical: '오픈AI', aliases: ['오픈AI', 'OpenAI'] },
]

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const LATIN_ALIAS_RE = /^[A-Za-z0-9+. ]+$/

// 영문 약어 별칭은 다른 영문 토큰 안에 우연히 포함되지 않도록 단어 경계로 매칭(KT ⊄ SKT).
// 한글 별칭은 \w 경계 개념이 없어 부분일치로 충분(그 앞뒤가 대개 한글이라 오탐 위험이 낮음).
function aliasRegExp(alias: string): RegExp {
  const escaped = escapeRegExp(alias)
  if (LATIN_ALIAS_RE.test(alias)) {
    return new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, 'i')
  }
  return new RegExp(escaped)
}

/** 제목에서 언급된 주체 회사 집합을 뽑는다(§1-2 C). 언급 없으면 빈 Set. */
export function extractCompanies(title: string): Set<string> {
  const companies = new Set<string>()
  if (!title) return companies
  for (const entry of COMPANY_DICTIONARY) {
    const matched = entry.aliases.some((alias) => aliasRegExp(alias).test(title))
    if (matched) companies.add(entry.canonical)
  }
  return companies
}

/** 회사명 가드 — 둘 다 비어있지 않은데 교집합이 없으면 차단(true = 다른 사건으로 간주). */
export function hasCompanyConflict(companiesA: ReadonlySet<string>, companiesB: ReadonlySet<string>): boolean {
  if (companiesA.size === 0 || companiesB.size === 0) return false
  for (const c of companiesA) {
    if (companiesB.has(c)) return false
  }
  return true
}

function isSignificantToken(token: string): boolean {
  if (token.length <= 1) return false
  if (/\d/.test(token)) return false
  if (SIGNATURE_STOPWORDS.has(token)) return false
  return true
}

/**
 * 시그니처 토큰 추출(§1-1) — 앞머리 코너명 제거 → 매체 접미사/구두점 정리(dedupeSourceArticles와
 * 공유) → 공백 토큰화 → 숫자 포함 토큰·불용어·1자 토큰 제외. 붙여쓰기 변형("B tv"/"Btv") 흡수를
 * 위해 인접한 짧은 라틴 토큰 + 다음 토큰을 합친 형태도 후보로 함께 담는다.
 */
export function buildSignatureTokens(rawTitle: string): Set<string> {
  const tokens = new Set<string>()
  if (!rawTitle) return tokens

  const withoutCorner = rawTitle.replace(/^\[[^[\]]{1,20}\]\s*/, '')
  const normalized = normalizeTitle(withoutCorner)
  const parts = normalized.split(' ').filter(Boolean)

  for (let i = 0; i < parts.length; i++) {
    const token = parts[i]
    if (isSignificantToken(token)) tokens.add(token)

    const next = parts[i + 1]
    if (next && token.length <= 2 && /^[a-z0-9]+$/.test(token)) {
      const joined = token + next
      if (isSignificantToken(joined)) tokens.add(joined)
    }
  }

  return tokens
}

/** 두 시그니처 토큰이 "같은 토큰"인가 — 완전 일치이거나, 짧은 쪽(3자 이상)이 긴 쪽의 부분문자열. */
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return short.length >= 3 && long.includes(short)
}

/** 부분문자열 포함까지 인정하는 자카드 유사도(§1-2 B). 그리디 매칭 — 소규모 토큰 집합용 근사치. */
export function signatureJaccard(tokensA: ReadonlySet<string>, tokensB: ReadonlySet<string>): number {
  if (tokensA.size === 0 || tokensB.size === 0) return 0

  const remainingB = new Set(tokensB)
  let matched = 0
  for (const ta of tokensA) {
    let matchedToken: string | null = null
    for (const tb of remainingB) {
      if (tokensMatch(ta, tb)) {
        matchedToken = tb
        break
      }
    }
    if (matchedToken !== null) {
      remainingB.delete(matchedToken)
      matched++
    }
  }

  const union = tokensA.size + tokensB.size - matched
  return union === 0 ? 0 : matched / union
}

function daysWithinOne(publishedAtA: string | null | undefined, publishedAtB: string | null | undefined): boolean {
  if (!publishedAtA || !publishedAtB) return false
  const timeA = new Date(publishedAtA).getTime()
  const timeB = new Date(publishedAtB).getTime()
  if (!Number.isFinite(timeA) || !Number.isFinite(timeB)) return false
  return Math.abs(timeA - timeB) <= ONE_DAY_MS
}

/** A·B·C를 모두 만족해야 같은 사건(§1-2). 하나라도 실패하면 false. */
export function isSameEvent(a: GroupableArticle, b: GroupableArticle): boolean {
  if (!daysWithinOne(a.published_at, b.published_at)) return false

  const companiesA = extractCompanies(a.title ?? '')
  const companiesB = extractCompanies(b.title ?? '')
  if (hasCompanyConflict(companiesA, companiesB)) return false

  const tokensA = buildSignatureTokens(a.title ?? '')
  const tokensB = buildSignatureTokens(b.title ?? '')
  return signatureJaccard(tokensA, tokensB) >= SAME_EVENT_MIN_JACCARD
}

function hasRealSource(source: string | null | undefined): boolean {
  if (!source) return false
  const trimmed = source.trim()
  return trimmed.length > 0 && trimmed !== '(미상)'
}

/** 그룹 대표 선정(§1-3, 결정론): 실매체명 우선 → 시그니처 토큰 수 많은 순 → 배열 순서상 먼저. */
function pickRepresentative<T extends GroupableArticle>(members: readonly T[]): T {
  if (members.length === 1) return members[0]

  const withRealSource = members.filter((m) => hasRealSource(m.source))
  const candidates = withRealSource.length > 0 ? withRealSource : members

  let best = candidates[0]
  let bestCount = buildSignatureTokens(best.title ?? '').size
  for (let i = 1; i < candidates.length; i++) {
    const count = buildSignatureTokens(candidates[i].title ?? '').size
    if (count > bestCount) {
      best = candidates[i]
      bestCount = count
    }
  }
  return best
}

/**
 * 근거기사 배열을 같은 사건 단위로 묶는다. 입력은 dedupeSourceArticles()를 먼저 통과시킨
 * 배열을 전제로 한다(완전일치는 이미 제거된 상태). 배열 순서를 따라 훑으며 각 기사를 기존
 * 그룹의 "앵커"(그 그룹에 처음 들어간 기사)와만 비교해 붙인다 — 그룹 내 전원 비교로 인한
 * 연쇄 병합(그룹 비대화)을 막기 위함. 최종 대표는 그룹이 다 만들어진 뒤 §1-3 규칙으로 뽑는다.
 * null/빈 배열/필드 누락에 안전하며 어떤 입력에도 throw 하지 않는다.
 */
export function groupSameEventArticles<T extends GroupableArticle>(
  articles: readonly T[] | null | undefined
): SameEventGroup<T>[] {
  if (!articles || articles.length === 0) return []

  const buckets: { anchor: T; members: T[] }[] = []

  for (const article of articles) {
    if (!article) continue
    const bucket = buckets.find((b) => isSameEvent(b.anchor, article))
    if (bucket) {
      bucket.members.push(article)
    } else {
      buckets.push({ anchor: article, members: [article] })
    }
  }

  return buckets.map((bucket) => {
    const representative = pickRepresentative(bucket.members)
    const others = bucket.members.filter((m) => m !== representative)
    return { representative, others }
  })
}
