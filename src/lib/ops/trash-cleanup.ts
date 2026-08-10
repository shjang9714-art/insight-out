import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

// 492 · 3단계 C — 휴지통 30일 초과분 자동 정리. 새 cron 을 만들지 않고 기존 ops-brief
// 크론 안에서 호출한다. 실패해도 예외를 던지지 않는다(감사·계측과 같은 원칙 — ops-brief
// 본체 발송을 막으면 안 된다).

const TRASH_RETENTION_DAYS = 30
/** 한 번에 지우는 상한. 조용히 자르지 않고 capped 로 결과에 남긴다. */
const CLEANUP_BATCH_LIMIT = 500

export interface TrashCleanupResult {
  deleted: number
  /** true 면 상한에 걸려 이번 실행에서 다 지우지 못했다는 뜻(다음 실행에 계속). */
  capped: boolean
  error: string | null
}

export async function cleanupExpiredTrash(admin: SupabaseClient): Promise<TrashCleanupResult> {
  try {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const { data: targets, error: selectError } = await admin
      .from('contents')
      .select('id')
      .not('deleted_at', 'is', null)
      .lt('deleted_at', cutoff)
      .limit(CLEANUP_BATCH_LIMIT)

    if (selectError) throw selectError

    const ids = (targets ?? []).map((row) => row.id as string)
    if (ids.length === 0) return { deleted: 0, capped: false, error: null }

    const { error: deleteError, count } = await admin
      .from('contents')
      .delete({ count: 'exact' })
      .in('id', ids)

    if (deleteError) throw deleteError

    return { deleted: count ?? 0, capped: ids.length === CLEANUP_BATCH_LIMIT, error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[휴지통 정리] 실패:', message)
    return { deleted: 0, capped: false, error: message }
  }
}
