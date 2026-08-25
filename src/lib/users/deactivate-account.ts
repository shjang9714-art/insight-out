import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * 계정 비활성화(F-09, 572 부터 관리자 전용 경로). updateOwnProfile()의
 * SELF_WRITABLE/FORBIDDEN 목록을 건드리지 않기 위해 별도 경로로 둔다 —
 * approval_status 는 그 목록에서 의도적으로 금지돼 있다.
 * approved 상태에서만 전이한다(이미 pending/rejected/deactivated 인 계정을 덮어쓰지 않음).
 */
export async function deactivateAccountById(userId: string): Promise<void> {
  const { error } = await createAdminClient()
    .from('users')
    .update({ approval_status: 'deactivated', deactivated_at: new Date().toISOString() })
    .eq('id', userId)
    .eq('approval_status', 'approved')

  if (error) throw error
}
