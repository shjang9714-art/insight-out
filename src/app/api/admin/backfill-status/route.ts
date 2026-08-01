import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse } from 'next/server'
import { pendingCount as pendingBody } from '@/lib/contents/enrich-body'
import { pendingCount as pendingThumbnail } from '@/lib/contents/thumbnail-backfill'
import { pendingCount as pendingPdfCover } from '@/lib/contents/pdf-cover-backfill'
import { pendingCount as pendingCluster } from '@/lib/crawler/cluster-backfill'
import { pendingCount as pendingYoutubeTranscript } from '@/lib/contents/youtube-transcript-backfill'
import type { EnrichJobKey } from '@/lib/admin/enrich-jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'


/**
 * GET /api/admin/backfill-status
 * 실행 없이 각 백필의 미처리 건수만 조회. 하나가 실패해도 나머지는 정상 반환한다.
 */
export async function GET() {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  const admin = gate.admin

  const results = await Promise.allSettled([
    pendingBody(admin),
    pendingThumbnail(admin, 'fresh'),
    pendingPdfCover(admin, 'fresh'),
    pendingCluster(admin),
    pendingYoutubeTranscript(admin, 'fresh'),
  ])

  const [body, thumbnail, pdfCover, cluster, youtubeTranscript] = results.map((r) =>
    r.status === 'fulfilled' ? r.value : null
  )

  const counts: Partial<Record<EnrichJobKey, number | null>> = {
    'admin:body-backfill': body,
    'admin:thumbnail-backfill': thumbnail,
    'admin:pdf-cover-backfill': pdfCover,
    'admin:cluster-backfill': cluster,
    'admin:youtube-transcript': youtubeTranscript,
  }

  return NextResponse.json({ counts })
}
