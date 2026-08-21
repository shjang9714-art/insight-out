export interface ProviderCounts {
  keyword_google: number
  keyword_naver: number
  keyword_gdelt: number
  company_google: number
  keyword_phase_skipped: boolean
  company_phase_skipped: boolean
}

export interface EntityLinkStats {
  attempted: number
  linked: number
  aliasMapSize: number
}

export function parseProviderCounts(meta: unknown): ProviderCounts | null {
  if (!meta || typeof meta !== 'object') return null
  const providers = (meta as Record<string, unknown>).providers
  if (!providers || typeof providers !== 'object') return null
  const value = providers as Record<string, unknown>

  if (
    typeof value.keyword_google !== 'number' ||
    typeof value.keyword_naver !== 'number' ||
    typeof value.keyword_gdelt !== 'number' ||
    typeof value.company_google !== 'number' ||
    typeof value.keyword_phase_skipped !== 'boolean' ||
    (value.company_phase_skipped !== undefined && typeof value.company_phase_skipped !== 'boolean')
  ) {
    return null
  }

  return {
    keyword_google: value.keyword_google,
    keyword_naver: value.keyword_naver,
    keyword_gdelt: value.keyword_gdelt,
    company_google: value.company_google,
    keyword_phase_skipped: value.keyword_phase_skipped,
    company_phase_skipped: value.company_phase_skipped ?? false,
  }
}

export function parseEntityLinkStats(meta: unknown): EntityLinkStats | null {
  if (!meta || typeof meta !== 'object') return null
  const entityLinks = (meta as Record<string, unknown>).entityLinks
  if (!entityLinks || typeof entityLinks !== 'object') return null
  const value = entityLinks as Record<string, unknown>

  if (
    typeof value.attempted !== 'number' ||
    typeof value.linked !== 'number' ||
    typeof value.aliasMapSize !== 'number'
  ) {
    return null
  }

  return {
    attempted: value.attempted,
    linked: value.linked,
    aliasMapSize: value.aliasMapSize,
  }
}
