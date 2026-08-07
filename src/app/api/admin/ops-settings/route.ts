import { NextResponse } from 'next/server'
import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { completeAudit } from '@/lib/admin/audit'
import { getOpsSettings } from '@/lib/ops/settings'

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
  const recipients = Array.isArray(body?.brief_recipients) ? body.brief_recipients.filter((v): v is string => typeof v === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) : before.brief_recipients
  if (Array.isArray(body?.brief_recipients) && recipients.length !== body.brief_recipients.length) return NextResponse.json({ error: '수신자 이메일 형식이 올바르지 않습니다.' }, { status: 400 })
  const positive = (key: string, max?: number) => {
    const value = body?.[key]
    if (value === undefined || value === null || value === '') return null
    if (typeof value !== 'number' || value <= 0 || (max !== undefined && value > max)) throw new Error(`${key} 값이 올바르지 않습니다.`)
    return value
  }
  try {
    const next = { brief_recipients: recipients, tts_monthly_char_cap: positive('tts_monthly_char_cap'), translation_monthly_char_cap: positive('translation_monthly_char_cap'), briefing_top_n: positive('briefing_top_n', 50), briefing_min_articles: positive('briefing_min_articles', 100), briefing_window_hours: positive('briefing_window_hours', 168), briefing_host_name: typeof body?.briefing_host_name === 'string' ? body.briefing_host_name.trim() || null : before.briefing_host_name }
    const { error } = await gate.admin.from('ops_settings').upsert({ id: true, ...next, updated_by: gate.userId, updated_at: new Date().toISOString() })
    await completeAudit(gate.admin, gate.auditId, { action: 'ops.settings.update', payload: { before, after: next }, outcome: error ? 'failed' : 'ok', error: error?.message })
    if (error) return NextResponse.json({ error: '운영 설정 저장에 실패했습니다.' }, { status: 500 })
    return NextResponse.json(next)
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '값이 올바르지 않습니다.' }, { status: 400 }) }
}
