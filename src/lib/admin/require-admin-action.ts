import 'server-only'

import { AUTH_MESSAGES } from '@/lib/admin/auth-messages'
import { hasCapability, type AdminCapability } from '@/lib/admin/capabilities'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { startAudit } from '@/lib/admin/audit'

type Fail = { ok: false; error: string }
type Ok = { ok: true; userId: string; role: string; auditId: string | null }

export async function requireAdminAction(
  opts?: { capability?: AdminCapability; action?: string },
): Promise<Ok | Fail> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return { ok: false, error: AUTH_MESSAGES.loginRequired }
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = profile?.role
  if (role !== 'admin') {
    return { ok: false, error: AUTH_MESSAGES.adminRequired }
  }

  if (opts?.capability && !hasCapability(role, opts.capability)) {
    return { ok: false, error: AUTH_MESSAGES.capabilityRequired }
  }

  let auditId: string | null = null
  if (opts?.action) {
    try {
      auditId = await startAudit(createAdminClient(), {
        actorId: user.id,
        actorEmail: user.email,
        action: opts.action,
        capability: opts.capability,
      })
    } catch (error) {
      console.error('[admin-audit] 서버 액션 시작 기록 실패:', error)
    }
  }
  return { ok: true, userId: user.id, role, auditId }
}
