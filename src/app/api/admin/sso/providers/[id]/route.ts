import { NextRequest, NextResponse } from 'next/server'
import {
  deleteProvider,
  getProvider,
  SsoAdminError,
  updateProvider,
  type SsoNameIdFormat,
  type UpdateSsoProviderInput,
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

function parseUpdateInput(body: unknown): UpdateSsoProviderInput {
  if (!isRecord(body)) throw new SsoAdminError(400, '요청 본문은 JSON 객체여야 합니다.')
  const input: UpdateSsoProviderInput = {}

  if (body.metadata_url !== undefined && body.metadata_xml !== undefined) {
    throw new SsoAdminError(400, 'metadata_url 과 metadata_xml 을 동시에 보낼 수 없습니다.')
  }
  if (body.metadata_url !== undefined) {
    if (typeof body.metadata_url !== 'string') throw new SsoAdminError(400, 'metadata_url 은 문자열이어야 합니다.')
    const metadataUrl = body.metadata_url.trim()
    let url: URL
    try {
      url = new URL(metadataUrl)
    } catch {
      throw new SsoAdminError(400, 'metadata_url 형식이 올바르지 않습니다.')
    }
    if (url.protocol !== 'https:') throw new SsoAdminError(400, 'metadata_url 은 https URL만 허용합니다.')
    input.metadata_url = metadataUrl
  }
  if (body.metadata_xml !== undefined) {
    if (typeof body.metadata_xml !== 'string' || !body.metadata_xml.trim()) {
      throw new SsoAdminError(400, 'metadata_xml 은 비어 있지 않은 문자열이어야 합니다.')
    }
    input.metadata_xml = body.metadata_xml.trim()
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
  if (Object.keys(input).length === 0) throw new SsoAdminError(400, '변경할 필드가 없습니다.')

  return input
}

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Context) {
  const gate = await verifyAdminRequest({ capability: 'manage_settings' })
  if (!gate.ok) return gate.response

  try {
    const { id } = await params
    return NextResponse.json({ provider: await getProvider(id) })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(request: NextRequest, { params }: Context) {
  const gate = await verifyAdminRequest({ capability: 'manage_settings' })
  if (!gate.ok) return gate.response

  try {
    const [{ id }, body] = await Promise.all([params, request.json()])
    return NextResponse.json({ provider: await updateProvider(id, parseUpdateInput(body)) })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  const gate = await verifyAdminRequest({ capability: 'manage_settings' })
  if (!gate.ok) return gate.response

  try {
    const { id } = await params
    await deleteProvider(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}
