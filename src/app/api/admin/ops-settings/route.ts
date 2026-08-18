import { NextResponse } from 'next/server'
import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { completeAudit } from '@/lib/admin/audit'
import { getOpsSettings } from '@/lib/ops/settings'

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function hasOwn(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key)
}

export async function GET() {
  const gate = await verifyAdminRequest({ capability: 'manage_settings' })
  if (!gate.ok) return gate.response
  return NextResponse.json(await getOpsSettings())
}

export async function POST(request: Request) {
  const gate = await verifyAdminRequest({ capability: 'manage_settings' })
  if (!gate.ok) return gate.response
  const before = await getOpsSettings()
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body || Array.isArray(body)) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const positive = (key: string, label: string, max?: number) => {
    if (!hasOwn(body, key)) return undefined
    const value = body[key]
    if (typeof value !== 'number' || value <= 0 || (max !== undefined && value > max)) throw new Error(`${label} 값이 올바르지 않습니다.`)
    return value
  }

  try {
    const changes: Record<string, string | string[] | number | null> = {}

    if (hasOwn(body, 'brief_recipients')) {
      if (!Array.isArray(body.brief_recipients)) throw new Error('수신자 목록 형식이 올바르지 않습니다.')
      const recipients = body.brief_recipients.map((value) => typeof value === 'string' ? value.trim() : value)
      if (!recipients.every((value): value is string => typeof value === 'string' && EMAIL_PATTERN.test(value))) {
        throw new Error('수신자 이메일 형식이 올바르지 않습니다.')
      }
      changes.brief_recipients = recipients
    }

    const positiveValues = {
      tts_monthly_char_cap: positive('tts_monthly_char_cap', 'TTS 월간 글자 한도'),
      translation_monthly_char_cap: positive('translation_monthly_char_cap', '번역 월간 글자 한도'),
      briefing_top_n: positive('briefing_top_n', '브리핑 최대 기사 수', 50),
      briefing_min_articles: positive('briefing_min_articles', '브리핑 최소 기사 수', 100),
      briefing_window_hours: positive('briefing_window_hours', '브리핑 수집 시간', 168),
    }
    for (const [key, value] of Object.entries(positiveValues)) {
      if (value !== undefined) changes[key] = value
    }

    if (hasOwn(body, 'briefing_host_name')) {
      if (typeof body.briefing_host_name !== 'string') throw new Error('브리핑 진행자 이름 형식이 올바르지 않습니다.')
      changes.briefing_host_name = body.briefing_host_name.trim() || null
    }

    if (Object.keys(changes).length === 0) {
      return NextResponse.json({ error: '변경할 운영 설정이 없습니다.' }, { status: 400 })
    }

    const next = { ...before, ...changes }
    const { error } = await gate.admin.from('ops_settings').upsert({ id: true, ...changes, updated_by: gate.userId, updated_at: new Date().toISOString() })
    await completeAudit(gate.admin, gate.auditId, { action: 'ops.settings.update', payload: { before, after: next }, outcome: error ? 'failed' : 'ok', error: error?.message })
    if (error) return NextResponse.json({ error: '운영 설정 저장에 실패했습니다.' }, { status: 500 })
    return NextResponse.json(next)
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '값이 올바르지 않습니다.' }, { status: 400 }) }
}
