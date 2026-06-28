import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkLink } from '@/lib/contents/link-health'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const BATCH = 40

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  }

  const deadline = Date.now() + 100_000
  const admin = createAdminClient()

  // 대상: published·원문 있음, 미점검 우선 → 오래된 순
  const { data, error } = await admin
    .from('contents')
    .select('id, original_url, link_checked_at')
    .eq('status', 'published')
    .not('original_url', 'is', null)
    .order('link_checked_at', { ascending: true, nullsFirst: true })
    .limit(BATCH)

  if (error) {
    // 42703(컬럼 미적용) 등 → graceful 종료
    return Response.json({ ok: true, skipped: true, reason: error.message })
  }

  let checked = 0, dead = 0
  for (const row of (data ?? []) as { id: string; original_url: string }[]) {
    if (Date.now() >= deadline) break
    const health = await checkLink(row.original_url)
    // unknown은 link_ok 안 건드림(이전 값 유지), checked_at만 갱신해 재점검 큐 뒤로
    const patch: Record<string, unknown> = { link_checked_at: new Date().toISOString() }
    if (health === 'dead') { patch.link_ok = false; dead++ }
    else if (health === 'ok') { patch.link_ok = true }
    await admin.from('contents').update(patch).eq('id', row.id)
    checked++
  }

  return Response.json({ ok: true, checked, dead })
}
