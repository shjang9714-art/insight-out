import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { coverFromPdfFirstPage } from '@/lib/contents/cover-from-pdf'

// 286 — 업로드 PDF(file_path 있음, category='리포트' 계열) 전용 백필.
// 282 썸네일 백필은 category IN ('뉴스','웹인사이트') AND original_url IS NOT NULL(크롤분)만 건드리고,
// 이 백필은 file_path 있는 PDF만 건드린다 — 두 대상 집합은 겹치지 않으므로 같은 thumbnail_fetched_at
// 마커를 공유해도 서로 덮지 않는다. (282의 대상 카테고리가 넓어지면 이 가정이 깨짐 — 대상 조건 넓히지 말 것.)

/** 순차 처리 · 작은 배치 — PDF 렌더는 CPU·메모리를 크게 먹는다(282 썸네일보다 훨씬 무거움). */
const DEFAULT_LIMIT = 5
const MAX_LIMIT = 10

export interface DrainOptions {
  limit?: number
  /** Date.now() 값. 설정 시 deadline 초과까지 반복, 미설정 시 단일 배치. */
  deadline?: number
  /** fresh(기본): thumbnail_fetched_at IS NULL(아직 시도 안 함). retry: 과거 실패행(thumbnail_fetched_at 있음)만 재대상. */
  mode?: 'fresh' | 'retry'
}

export interface DrainResult {
  processed: number
  filled: number
  skipped: number
  remaining: number
  /** false = thumbnail_fetched_at 컬럼 미적용(42703) → 219 SQL 적용 필요 */
  ready: boolean
}

interface PdfContentRow {
  id: string
  file_path: string
}

export async function pendingCount(admin: SupabaseClient, mode: 'fresh' | 'retry'): Promise<number> {
  const q = admin
    .from('contents')
    .select('id', { count: 'exact', head: true })
    .not('file_path', 'is', null)
    .ilike('file_path', '%.pdf')
    .is('thumbnail_url', null)
    .or(mode === 'retry' ? 'thumbnail_fetched_at.not.is.null' : 'thumbnail_fetched_at.is.null')
  const { count } = await q
  return count ?? 0
}

/**
 * 단일 PDF 행에 1페이지 표지를 시도한다(286). 성공·실패·다운로드실패 어느 경우든
 * thumbnail_fetched_at 을 마킹해 무한 재렌더를 막는다(219·282 마커 패턴 — PDF 렌더는
 * CPU·메모리를 크게 먹으므로 썸네일보다 이 마킹의 중요도가 훨씬 크다).
 * 렌더/저장은 285의 coverFromPdfFirstPage 를 그대로 재사용(로직 복제 금지).
 */
async function processOne(admin: SupabaseClient, row: PdfContentRow): Promise<'filled' | 'skipped'> {
  let filled = false

  try {
    const { data: fileData, error: dlErr } = await admin.storage
      .from('reports')
      .download(row.file_path)

    if (dlErr || !fileData) {
      console.warn(`[PDF 커버 백필] 다운로드 실패(id=${row.id}, path=${row.file_path}):`, dlErr?.message)
    } else {
      const buffer = new Uint8Array(await fileData.arrayBuffer())
      const result = await coverFromPdfFirstPage(admin, row.id, buffer)
      filled = result.ok
    }
  } catch (e) {
    console.error(`[PDF 커버 백필] 처리 오류(id=${row.id}):`, e instanceof Error ? e.message : String(e))
  }

  const { error: markErr } = await admin
    .from('contents')
    .update({ thumbnail_fetched_at: new Date().toISOString() })
    .eq('id', row.id)
  if (markErr) {
    console.error(`[PDF 커버 백필] 시도 마킹 실패(id=${row.id}):`, markErr.message)
  }

  return filled ? 'filled' : 'skipped'
}

/**
 * PDF 1페이지 표지 백필 드레인(286) — 282 drainThumbnailBackfill 구조 복제.
 * deadline 미설정: 단일 배치(limit 건) 처리 후 반환.
 * deadline 설정: deadline 초과 또는 remaining=0까지 반복.
 * thumbnail_fetched_at 컬럼 미적용(42703) 시 ready:false 로 graceful degrade(무한 루프 금지).
 */
export async function drainPdfCoverBackfill(
  admin: SupabaseClient,
  { limit = DEFAULT_LIMIT, deadline, mode = 'fresh' }: DrainOptions = {},
): Promise<DrainResult> {
  const effectiveLimit = Math.min(Math.max(limit, 1), MAX_LIMIT)
  let processed = 0, filled = 0, skipped = 0, remaining = 0

  while (true) {
    if (deadline !== undefined && Date.now() >= deadline) break

    const targetQ = admin
      .from('contents')
      .select('id, file_path')
      .not('file_path', 'is', null)
      .ilike('file_path', '%.pdf')
      .is('thumbnail_url', null)
      .or(mode === 'retry' ? 'thumbnail_fetched_at.not.is.null' : 'thumbnail_fetched_at.is.null')

    const { data: targets, error } = await targetQ
      .order('collected_at', { ascending: false })
      .limit(effectiveLimit)

    if (error) {
      if (error.code === '42703') {
        return { processed: 0, filled: 0, skipped: 0, remaining: 0, ready: false }
      }
      break
    }

    if (!targets?.length) {
      remaining = await pendingCount(admin, mode)
      break
    }

    // 순차 처리 — 병렬 렌더 금지(메모리). 한 행 실패가 배치를 죽이지 않도록 processOne 내부에서 격리.
    for (const row of targets as PdfContentRow[]) {
      const result = await processOne(admin, row)
      if (result === 'filled') filled++
      else skipped++
    }
    processed += targets.length
    remaining = await pendingCount(admin, mode)

    if (remaining === 0) break
    if (deadline === undefined) break
  }

  return { processed, filled, skipped, remaining, ready: true }
}
