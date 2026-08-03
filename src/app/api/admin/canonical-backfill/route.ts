import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse, type NextRequest } from 'next/server'
import { resolveCanonical } from '@/lib/crawler/resolve-url'
import { mergeByCanonical } from '@/lib/crawler/orchestrator'
import { runJob } from '@/lib/jobs/run-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300


interface CanonicalRow {
  id: string
  original_url: string
}

/**
 * GET /api/admin/canonical-backfill?limit=N
 * canonical_url IS NULL AND original_url IS NOT NULL 대상(수집일 최신 우선) N건을 해소.
 * 컬럼 미적용(42703) 시 graceful({ ready: false }).
 */
export async function GET(request: NextRequest) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  const limitParam = request.nextUrl.searchParams.get('limit')
  const limit = Math.min(Math.max(parseInt(limitParam || '15', 10) || 15, 1), 30)

  const admin = gate.admin

  try {
    const result = await runJob(admin, { key: 'admin:canonical-backfill', trigger: 'admin', startedBy: gate.userId }, async () => {
      const { data: targets, error } = await admin
        .from('contents')
        .select('id, original_url')
        .is('canonical_url', null)
        .not('original_url', 'is', null)
        .order('collected_at', { ascending: false })
        .limit(limit)

      if (error) {
        if (error.code === '42703') {
          return { processed: 0, resolved: 0, deduped: 0, remaining: 0, ready: false }
        }
        throw error
      }

      let processed = 0, resolved = 0, deduped = 0

      for (const row of (targets ?? []) as CanonicalRow[]) {
        processed++
        try {
          const canonical = await resolveCanonical(row.original_url)
          const { error: updError } = await admin
            .from('contents')
            .update({ canonical_url: canonical })
            .eq('id', row.id)

          if (!updError) {
            resolved++
            const merged = await mergeByCanonical(admin, row.id, canonical)
            if (merged) deduped++
          }
        } catch (e) {
          console.error('[canonical-backfill] 항목 처리 오류 (id:', row.id, '):', e)
        }
      }

      const { count } = await admin
        .from('contents')
        .select('id', { count: 'exact', head: true })
        .is('canonical_url', null)
        .not('original_url', 'is', null)

      return { processed, resolved, deduped, remaining: count ?? 0, ready: true }
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/admin/canonical-backfill GET] 오류(graceful):', err)
    return NextResponse.json({ processed: 0, resolved: 0, deduped: 0, remaining: 0, ready: false })
  }
}
