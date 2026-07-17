import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

/** 사용자가 스스로 바꿀 수 있는 컬럼. 이 목록에 없는 쓰기는 거부한다. */
const SELF_WRITABLE = [
  'name',
  'department',
  'team',
  'team_name',
  'default_lens',
  'onboarding_completed',
  'feed_categories',
  'feed_onboarding_skipped',
  'last_seen_at',
] as const

export type SelfWritableColumn = typeof SELF_WRITABLE[number]

const FORBIDDEN = [
  'role',
  'approval_status',
  'approved_at',
  'approved_by',
  'id',
  'email',
] as const

export async function updateOwnProfile(
  userId: string,
  patch: Partial<Record<SelfWritableColumn, unknown>>,
): Promise<void> {
  for (const key of Object.keys(patch)) {
    if ((FORBIDDEN as readonly string[]).includes(key)) {
      throw new Error(`[updateOwnProfile] 금지된 컬럼: ${key}`)
    }
    if (!(SELF_WRITABLE as readonly string[]).includes(key)) {
      throw new Error(`[updateOwnProfile] 허용되지 않은 컬럼: ${key}`)
    }
  }

  const { error } = await createAdminClient()
    .from('users')
    .update(patch)
    .eq('id', userId)

  if (error) throw error
}
