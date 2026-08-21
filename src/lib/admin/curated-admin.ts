import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

export type CuratedGroupKind = 'watchlist' | 'competitor'
export type CuratedGroupDisplayMode = 'always' | 'on_issue'

const GROUP_KINDS: CuratedGroupKind[] = ['watchlist', 'competitor']
const GROUP_DISPLAY_MODES: CuratedGroupDisplayMode[] = ['always', 'on_issue']

export class CuratedInputError extends Error {}

export function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new CuratedInputError(`${label}은(는) 비울 수 없습니다.`)
  }
  return value.trim()
}

export function optionalTextArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new CuratedInputError(`${label}은(는) 문자열 배열이어야 합니다.`)
  }
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))]
}

export function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new CuratedInputError(`${label}은(는) true 또는 false여야 합니다.`)
  return value
}

export function optionalInteger(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new CuratedInputError(`${label}은(는) 정수여야 합니다.`)
  }
  return value
}

export function groupKind(value: unknown): CuratedGroupKind {
  if (typeof value !== 'string' || !GROUP_KINDS.includes(value as CuratedGroupKind)) {
    throw new CuratedInputError('그룹 종류는 watchlist 또는 competitor여야 합니다.')
  }
  return value as CuratedGroupKind
}

export function groupDisplayMode(value: unknown): CuratedGroupDisplayMode {
  if (typeof value !== 'string' || !GROUP_DISPLAY_MODES.includes(value as CuratedGroupDisplayMode)) {
    throw new CuratedInputError('표시 방식은 always 또는 on_issue여야 합니다.')
  }
  return value as CuratedGroupDisplayMode
}

export async function assertGroupKeysExist(admin: SupabaseClient, keys: string[]): Promise<void> {
  if (keys.length === 0) return
  const { data, error } = await admin
    .from('curated_groups')
    .select('key')
    .in('key', keys)
    .limit(keys.length)
  if (error) throw error
  const existing = new Set((data ?? []).map((row) => row.key))
  const missing = keys.filter((key) => !existing.has(key))
  if (missing.length > 0) throw new CuratedInputError(`존재하지 않는 그룹입니다: ${missing.join(', ')}`)
}

export async function countCompanyInsightCards(admin: SupabaseClient, companyName: string): Promise<number> {
  const { count, error } = await admin
    .from('insight_cards')
    .select('id', { count: 'exact', head: true })
    .eq('scope', 'company')
    .eq('topic', companyName)
  if (error) throw error
  return count ?? 0
}

export function inputErrorResponse(error: unknown): { error: string } | null {
  return error instanceof CuratedInputError ? { error: error.message } : null
}
