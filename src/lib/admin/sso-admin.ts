import 'server-only'
import type { SsoNameIdFormat } from '@/lib/admin/sso-name-id'

export type { SsoNameIdFormat }

export interface PublicSsoProvider {
  id: string
  resource_id: string | null
  disabled: boolean
  saml: {
    entity_id: string | null
    metadata_url: string | null
  }
  domains: Array<{ domain: string }>
  created_at: string | null
  updated_at: string | null
}

export interface CreateSsoProviderInput {
  type: 'saml'
  metadata_url?: string
  metadata_xml?: string
  domains?: string[]
  attribute_mapping?: Record<string, unknown>
  name_id_format?: SsoNameIdFormat
  resource_id?: string
  disabled?: boolean
}

export type UpdateSsoProviderInput = Omit<CreateSsoProviderInput, 'type'>

export class SsoAdminError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'SsoAdminError'
    this.status = status
  }
}

function getConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new SsoAdminError(500, 'Supabase SSO 관리 환경변수가 설정되지 않았습니다.')
  }

  return {
    baseUrl: `${supabaseUrl}/auth/v1/admin/sso/providers`,
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
    },
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export function toPublicProvider(value: unknown): PublicSsoProvider {
  const provider = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const saml = provider.saml && typeof provider.saml === 'object'
    ? provider.saml as Record<string, unknown>
    : {}
  const domains = Array.isArray(provider.domains)
    ? provider.domains.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return []
        const domain = (entry as Record<string, unknown>).domain
        return typeof domain === 'string' ? [{ domain }] : []
      })
    : []

  return {
    id: stringOrNull(provider.id) ?? '',
    resource_id: stringOrNull(provider.resource_id),
    disabled: provider.disabled === true,
    saml: {
      entity_id: stringOrNull(saml.entity_id),
      metadata_url: stringOrNull(saml.metadata_url),
    },
    domains,
    created_at: stringOrNull(provider.created_at),
    updated_at: stringOrNull(provider.updated_at),
  }
}

async function parseError(response: Response): Promise<never> {
  const body = await response.text()
  let message = body || response.statusText || 'GoTrue SSO 관리 요청에 실패했습니다.'

  if (body) {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>
      const candidate = parsed.message ?? parsed.msg ?? parsed.error ?? parsed.error_description
      if (typeof candidate === 'string') message = candidate
    } catch {
      // JSON 이 아닌 GoTrue 응답 본문도 원문 그대로 전달한다.
    }
  }

  throw new SsoAdminError(response.status, message)
}

async function request(path = '', init?: RequestInit): Promise<unknown> {
  const { baseUrl, headers } = getConfig()
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...headers, ...init?.headers },
    cache: 'no-store',
  })

  if (!response.ok) return parseError(response)
  if (response.status === 204) return null
  return response.json()
}

export async function listProviders(): Promise<PublicSsoProvider[]> {
  const response = await request()
  const values = Array.isArray(response)
    ? response
    : response && typeof response === 'object' && Array.isArray((response as Record<string, unknown>).items)
      ? (response as Record<string, unknown>).items as unknown[]
      : []
  return values.map(toPublicProvider)
}

export async function getProvider(id: string): Promise<PublicSsoProvider> {
  return toPublicProvider(await request(`/${encodeURIComponent(id)}`))
}

export async function createProvider(input: CreateSsoProviderInput): Promise<PublicSsoProvider> {
  return toPublicProvider(await request('', {
    method: 'POST',
    body: JSON.stringify(input),
  }))
}

export async function updateProvider(id: string, input: UpdateSsoProviderInput): Promise<PublicSsoProvider> {
  return toPublicProvider(await request(`/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  }))
}

export async function deleteProvider(id: string): Promise<void> {
  await request(`/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
