import type { NextRequest } from 'next/server'
import { runCrawl } from '@/lib/crawler/orchestrator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function monthWindow(value: string | null): { from: string; to: string } | null {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null
  const from = new Date(`${value}-01T00:00:00.000Z`)
  if (Number.isNaN(from.getTime())) return null
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1))
  return { from: from.toISOString(), to: to.toISOString() }
}

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET ?? ''}`) return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  if (!process.env.GCP_SA_KEY) return Response.json({ ok: true, skipped: true, reason: 'GCP 키 없음' })
  const params = request.nextUrl.searchParams
  const month = monthWindow(params.get('month'))
  const from = month?.from ?? params.get('from')
  const to = month?.to ?? params.get('to')
  if (!from || !to || Number.isNaN(new Date(from).getTime()) || Number.isNaN(new Date(to).getTime()) || new Date(from) >= new Date(to)) return Response.json({ ok: false, error: 'month 또는 유효한 from/to가 필요합니다.' }, { status: 400 })
  try {
    return Response.json(await runCrawl({ gdeltBackfill: { from, to } }))
  } catch (error) {
    console.error('[크론/gdelt-backfill] 오류:', error)
    return Response.json({ ok: false, error: 'GDELT 백필 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
