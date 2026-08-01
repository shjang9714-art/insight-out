import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const issueId = request.nextUrl.searchParams.get('issueId')
  if (!issueId) return NextResponse.json({ error: 'issueId 필요' }, { status: 400 })

  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  const { data } = await gate.admin
    .from('newsletter_recipients')
    .select('status, email, delivered_at, opened_at')
    .eq('issue_id', issueId)

  return NextResponse.json(data ?? [])
}
