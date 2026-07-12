import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import type { TrendingEvent } from './trending'

export interface TrendingSnapshotRow {
  rank: number
  issueId: string
  contentId: string | null
  headline: string
  hashtag: string | null
  todayCount: number
}

interface SnapshotDbRow {
  rank: number
  issue_id: string
  content_id: string | null
  headline: string
  hashtag: string | null
  today_count: number
}

/** 날짜 선택 조회(§6-3)용 — anon GRANT된 테이블이라 기존 서버 클라이언트로 충분. */
export async function fetchTrendingSnapshot(
  supabase: SupabaseClient,
  snapshotDate: string,
): Promise<TrendingSnapshotRow[]> {
  const { data, error } = await supabase
    .from('trending_snapshots')
    .select('rank, issue_id, content_id, headline, hashtag, today_count')
    .eq('snapshot_date', snapshotDate)
    .order('rank', { ascending: true })

  if (error || !data) return []

  return (data as SnapshotDbRow[]).map(row => ({
    rank: row.rank,
    issueId: row.issue_id,
    contentId: row.content_id,
    headline: row.headline,
    hashtag: row.hashtag,
    todayCount: row.today_count,
  }))
}

/**
 * 크론 적재(§6-2) 전용 — service_role로 해당 날짜 기존 행을 지우고 새로 insert.
 * 같은 날 재실행돼도 (snapshot_date, rank) unique 제약과 절대 충돌하지 않는다(선삭제 후 insert라
 * ON CONFLICT UPSERT 불필요). delete+insert가 단순 upsert보다 나은 점 — 재실행 시 이전 실행보다
 * 결과 건수가 줄어도(예: 12건→10건) 남은 랭크 11·12가 잔존하지 않고 통째로 교체된다.
 */
export async function saveTrendingSnapshot(events: TrendingEvent[], snapshotDate: string): Promise<number> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  await supabase.from('trending_snapshots').delete().eq('snapshot_date', snapshotDate)

  const rows = events.map((e, i) => ({
    snapshot_date: snapshotDate,
    rank: i + 1,
    issue_id: e.issueId,
    content_id: e.contentId,
    headline: e.headline,
    hashtag: e.topHashtag,
    today_count: e.todayCount,
  }))

  if (rows.length === 0) return 0

  const { error } = await supabase.from('trending_snapshots').insert(rows)
  if (error) throw error
  return rows.length
}
