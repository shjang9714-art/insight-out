import 'server-only'

import { AUTH_MESSAGES } from '@/lib/admin/auth-messages'
import { hasCapability, type AdminCapability } from '@/lib/admin/capabilities'
import { createClient } from '@/lib/supabase/server'

type Fail = { ok: false; error: string }
type Ok = { ok: true; userId: string; role: string }

export async function requireAdminAction(
  opts?: { capability?: AdminCapability },
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

  return { ok: true, userId: user.id, role }
}
