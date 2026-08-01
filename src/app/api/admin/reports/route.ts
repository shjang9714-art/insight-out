import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse } from 'next/server'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'


/**
 * GET /api/admin/reports
 * 전략보고서 어드민 관리 목록(276) — 전체 상태(초안·생성중·완료·실패·발행) 조회.
 */
export async function GET() {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  const admin = gate.admin
  const { data, error } = await admin
    .from('ai_reports')
    .select('id, title, type, status, topic, summary, cover_image_url, publisher, published_at, error_message, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[admin/reports] 목록 조회 실패:', error)
    return NextResponse.json({ error: '목록을 불러오지 못했습니다.' }, { status: 500 })
  }

  const reports = (data ?? []).map((report) => ({
    ...report,
    summary: report.summary ? stripLlmArtifacts(report.summary) : null,
  }))

  return NextResponse.json({ reports })
}
