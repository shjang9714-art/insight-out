import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse } from 'next/server'
import { generateBriefing } from '@/lib/briefing/generate-briefing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60


export async function POST(req: Request) {
  try {
    const gate = await verifyAdminRequest()
    if (!gate.ok) return gate.response

    let force = false
    try {
      const body = await req.json()
      force = Boolean(body?.force)
    } catch {
      // body 없어도 허용
    }

    const result = await generateBriefing({ force })
    const status = result.ok ? 200 : 400
    return NextResponse.json(result, { status })
  } catch (err) {
    console.error('[/api/admin/briefings/generate] 오류:', err)
    return NextResponse.json(
      { error: '브리핑 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
