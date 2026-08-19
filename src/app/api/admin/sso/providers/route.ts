import { NextRequest, NextResponse } from 'next/server'
import {
  createProvider,
  listProviders,
  SsoAdminError,
  type CreateSsoProviderInput,
  type SsoNameIdFormat,
} from '@/lib/admin/sso-admin'
import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NAME_ID_FORMATS = new Set<SsoNameIdFormat>([
  'persistent',
  'emailAddress',
  'transient',
  'unspecified',
])

function errorResponse(error: unknown) {
  if (error instanceof SsoAdminError) {
    return NextResponse.json({ status: error.status, message: error.message }, { status: error.status })
  }
  const message = error instanceof Error ? error.message : String(error)
  return NextResponse.json({ status: 500, message }, { status: 500 })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseCreateInput(body: unknown): CreateSsoProviderInput {
  if (!isRecord(body)) throw new SsoAdminError(400, '요청 본문은 JSON 객체여야 합니다.')

  const metadataUrl = typeof body.metadata_url === 'string' ? body.metadata_url.trim() : ''
  const metadataXml = typeof body.metadata_xml === 'string' ? body.metadata_xml.trim() : ''
  if (Boolean(metadataUrl) === Boolean(metadataXml)) {
    throw new SsoAdminError(400, 'metadata_url 또는 metadata_xml 중 정확히 하나가 필요합니다.')
  }
  if (metadataUrl) {
    let url: URL
    try {
      url = new URL(metadataUrl)
    } catch {
      throw new SsoAdminError(400, 'metadata_url 형식이 올바르지 않습니다.')
    }
    if (url.protocol !== 'https:') {
      throw new SsoAdminError(400, 'metadata_url 은 https URL만 허용합니다.')
    }
  }

  const input: CreateSsoProviderInput = {
    type: 'saml',
    ...(metadataUrl ? { metadata_url: metadataUrl } : { metadata_xml: metadataXml }),
  }

  if (body.domains !== undefined) {
    if (!Array.isArray(body.domains) || !body.domains.every((domain) => typeof domain === 'string')) {
      throw new SsoAdminError(400, 'domains 는 문자열 배열이어야 합니다.')
    }
    const domains = body.domains.map((domain) => domain.trim()).filter(Boolean)
    if (domains.length > 0) input.domains = domains
  }
  if (body.resource_id !== undefined) {
    if (typeof body.resource_id !== 'string') throw new SsoAdminError(400, 'resource_id 는 문자열이어야 합니다.')
    const resourceId = body.resource_id.trim()
    if (resourceId) input.resource_id = resourceId
  }
  if (body.name_id_format !== undefined) {
    if (typeof body.name_id_format !== 'string' || !NAME_ID_FORMATS.has(body.name_id_format as SsoNameIdFormat)) {
      throw new SsoAdminError(400, 'name_id_format 값이 올바르지 않습니다.')
    }
    input.name_id_format = body.name_id_format as SsoNameIdFormat
  }
  if (body.attribute_mapping !== undefined) {
    if (!isRecord(body.attribute_mapping)) throw new SsoAdminError(400, 'attribute_mapping 은 JSON 객체여야 합니다.')
    input.attribute_mapping = body.attribute_mapping
  }
  if (body.disabled !== undefined) {
    if (typeof body.disabled !== 'boolean') throw new SsoAdminError(400, 'disabled 는 boolean 값이어야 합니다.')
    input.disabled = body.disabled
  }

  return input
}

export async function GET() {
  const gate = await verifyAdminRequest({ capability: 'manage_settings' })
  if (!gate.ok) return gate.response

  try {
    return NextResponse.json({ providers: await listProviders() })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  const gate = await verifyAdminRequest({ capability: 'manage_settings' })
  if (!gate.ok) return gate.response

  try {
    const provider = await createProvider(parseCreateInput(await request.json()))
    return NextResponse.json({ provider }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}

