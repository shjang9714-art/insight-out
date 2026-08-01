import 'server-only'

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AUTH_MESSAGES } from '@/lib/admin/auth-messages'
import { hasCapability, type AdminCapability } from '@/lib/admin/capabilities'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Fail = { ok: false; response: NextResponse }
type Ok = { ok: true; admin: SupabaseClient; userId: string; role: string }

export async function verifyAdminRequest(
  opts?: { capability?: AdminCapability },
): Promise<Ok | Fail> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: AUTH_MESSAGES.loginRequired }, { status: 401 }),
    }
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = profile?.role
  if (role !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json({ error: AUTH_MESSAGES.adminRequired }, { status: 403 }),
    }
  }

  if (opts?.capability && !hasCapability(role, opts.capability)) {
    return {
      ok: false,
      response: NextResponse.json({ error: AUTH_MESSAGES.capabilityRequired }, { status: 403 }),
    }
  }

  // 486: 감사 로그 기록 지점
  return { ok: true, admin: createAdminClient(), userId: user.id, role }
}
