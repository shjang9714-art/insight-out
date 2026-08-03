import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const RETENTION_DAYS = 90


function cutoffIso(): string {
  const d = new Date()
  d.setDate(d.getDate() - RETENTION_DAYS)
  return d.toISOString()
}

/** GET — 정리 대상(90일 초과) 건수 미리보기 */
export async function GET() {
  try {
    const gate = await verifyAdminRequest()
    if (!gate.ok) return gate.response

    const admin = gate.admin
    const { count, error } = await admin
      .from('job_runs')
      .select('id', { count: 'exact', head: true })
      .lt('started_at', cutoffIso())

    if (error) {
      if (error.code === '42P01') return NextResponse.json({ count: 0 })
      throw error
    }
    return NextResponse.json({ count: count ?? 0 })
  } catch (err) {
    console.error('[/api/admin/job-runs/cleanup] GET 오류:', err)
    return NextResponse.json({ error: '건수 조회 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

/** POST — 90일 초과 job_runs 삭제(292). 최근 이력은 보존. */
export async function POST() {
  try {
    const gate = await verifyAdminRequest()
    if (!gate.ok) return gate.response

    const admin = gate.admin
    const { error, count } = await admin
      .from('job_runs')
      .delete({ count: 'exact' })
      .lt('started_at', cutoffIso())

    if (error) {
      if (error.code === '42P01') return NextResponse.json({ deleted: 0 })
      throw error
    }
    return NextResponse.json({ deleted: count ?? 0 })
  } catch (err) {
    console.error('[/api/admin/job-runs/cleanup] POST 오류:', err)
    return NextResponse.json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
