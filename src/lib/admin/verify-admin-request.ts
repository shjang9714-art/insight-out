import 'server-only'

import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AUTH_MESSAGES } from '@/lib/admin/auth-messages'
import { hasCapability, type AdminCapability } from '@/lib/admin/capabilities'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { startAudit } from '@/lib/admin/audit'

type Fail = { ok: false; response: NextResponse }
type Ok = { ok: true; admin: SupabaseClient; userId: string; role: string; auditId: string | null }

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

  const admin = createAdminClient()
  const requestHeaders = await headers()
  const method = requestHeaders.get('x-http-method') ?? undefined
  const path = requestHeaders.get('x-pathname') ?? undefined
  const auditId = method === 'GET' || method === 'HEAD'
    ? null
    : await startAudit(admin, {
        actorId: user.id,
        actorEmail: user.email,
        action: `${method ?? 'UNKNOWN'} ${path ?? 'unknown'}`,
        method,
        path,
        capability: opts?.capability,
      })
  return { ok: true, admin, userId: user.id, role, auditId }
}
