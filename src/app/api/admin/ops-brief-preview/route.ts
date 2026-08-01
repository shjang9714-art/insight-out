import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import type { NextRequest } from 'next/server'
import { buildDailyBriefHtml, gatherDailyBrief } from '@/lib/ops/daily-brief'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60


export async function GET(request: NextRequest) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  try {
    const fail = request.nextUrl.searchParams.get('fail')
    const forceUnavailableSection = fail === 'usage' || fail === 'sources'
      ? fail
      : undefined
    const brief = await gatherDailyBrief(
      createAdminClient(),
      new Date(),
      { forceUnavailableSection }
    )
    if (request.nextUrl.searchParams.get('format') === 'html') {
      return new Response(buildDailyBriefHtml(brief), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      })
    }
    return Response.json(brief, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('[/api/admin/ops-brief-preview] 오류:', error)
    return Response.json(
      { error: '운영리포트 프리뷰 생성에 실패했습니다.' },
      { status: 500 }
    )
  }
}
