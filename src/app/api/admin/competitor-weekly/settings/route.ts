import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextRequest, NextResponse } from 'next/server'
import { getCompetitorWeeklySettings } from '@/lib/competitor-weekly/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'


/**
 * GET /api/admin/competitor-weekly/settings
 * 주간 리포트 발행 스케줄 설정(284) 조회. 테이블 미적용(42P01) 시 기본값 + ready:false.
 */
export async function GET() {
  const gate = await verifyAdminRequest({ capability: 'manage_settings' })
  if (!gate.ok) return gate.response

  const admin = gate.admin
  const { settings, ready } = await getCompetitorWeeklySettings(admin)
  return NextResponse.json({ settings, ready })
}

interface SettingsPatchBody {
  enabled?: boolean
  generate_dow?: number
  generate_hour?: number
  auto_publish?: boolean
}

/**
 * PATCH /api/admin/competitor-weekly/settings
 * body: { enabled?, generate_dow?(0~6), generate_hour?(0~23), auto_publish? }
 */
export async function PATCH(request: NextRequest) {
  const gate = await verifyAdminRequest({ capability: 'manage_settings' })
  if (!gate.ok) return gate.response

  let body: SettingsPatchBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const fields: Record<string, unknown> = {}

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled는 boolean이어야 합니다.' }, { status: 400 })
    }
    fields.enabled = body.enabled
  }
  if (body.generate_dow !== undefined) {
    if (!Number.isInteger(body.generate_dow) || body.generate_dow < 0 || body.generate_dow > 6) {
      return NextResponse.json({ error: 'generate_dow는 0~6 사이여야 합니다.' }, { status: 400 })
    }
    fields.generate_dow = body.generate_dow
  }
  if (body.generate_hour !== undefined) {
    if (!Number.isInteger(body.generate_hour) || body.generate_hour < 0 || body.generate_hour > 23) {
      return NextResponse.json({ error: 'generate_hour는 0~23 사이여야 합니다.' }, { status: 400 })
    }
    fields.generate_hour = body.generate_hour
  }
  if (body.auto_publish !== undefined) {
    if (typeof body.auto_publish !== 'boolean') {
      return NextResponse.json({ error: 'auto_publish는 boolean이어야 합니다.' }, { status: 400 })
    }
    fields.auto_publish = body.auto_publish
  }

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: '변경할 값이 없습니다.' }, { status: 400 })
  }

  const admin = gate.admin
  const { data, error } = await admin
    .from('competitor_weekly_settings')
    .update(fields)
    .eq('id', true)
    .select('enabled, generate_dow, generate_hour, auto_publish')
    .single()

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json({ error: 'SQL 284(competitor_weekly_settings)가 아직 적용되지 않았습니다.' }, { status: 409 })
    }
    console.error('[admin/competitor-weekly/settings] 갱신 실패:', error)
    return NextResponse.json({ error: '설정 저장에 실패했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ settings: data, ready: true })
}
