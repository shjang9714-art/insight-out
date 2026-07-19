import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { pendingCount as pendingBody } from '@/lib/contents/enrich-body'
import { pendingCount as pendingThumbnail } from '@/lib/contents/thumbnail-backfill'
import { pendingCount as pendingPdfCover } from '@/lib/contents/pdf-cover-backfill'
import { pendingCount as pendingCluster } from '@/lib/crawler/cluster-backfill'
import { pendingCount as pendingYoutubeTranscript } from '@/lib/contents/youtube-transcript-backfill'
import type { EnrichJobKey } from '@/lib/admin/enrich-jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function verifyAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }), userId: null }
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }), userId: null }
  }

  return { error: null, userId: user.id }
}

/**
 * GET /api/admin/backfill-status
 * 실행 없이 각 백필의 미처리 건수만 조회. 하나가 실패해도 나머지는 정상 반환한다.
 */
export async function GET() {
  const { error: authError } = await verifyAdmin()
  if (authError) return authError

  const admin = createAdminClient()

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
