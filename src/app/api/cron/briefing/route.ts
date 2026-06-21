import type { NextRequest } from 'next/server'
import { generateBriefing } from '@/lib/briefing/generate-briefing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  }

  try {
    const force = request.nextUrl.searchParams.get('force') === '1'
    const date = request.nextUrl.searchParams.get('date') ?? undefined

    const result = await generateBriefing({ force, date })
    return Response.json(result)
  } catch (err) {
    console.error('[크론/briefing] 브리핑 생성 오류:', err)
    const message = err instanceof Error ? err.message : String(err)
    return Response.json(
      { ok: false, error: '브리핑 생성 중 오류가 발생했습니다.', detail: message },
      { status: 500 }
    )
  }
}
