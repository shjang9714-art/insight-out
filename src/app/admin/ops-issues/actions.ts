'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'

async function requireAdmin() {
  const store = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => store.getAll(), setAll: cs => cs.forEach(c => store.set(c.name, c.value, c.options)) } })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('users').select('role').eq('id', user.id).single()
  return data?.role === 'admin' ? user : null
}

function serviceClient() { return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!) }
type Status = 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'ignored'

export async function updateOpsIssue(id: string, patch: { status?: Status; assignee?: string | null; resolution_note?: string | null }) {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: '권한이 없습니다.' }
  const update: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() }
  if (patch.status === 'resolved') update.resolved_at = new Date().toISOString()
  if (patch.status && patch.status !== 'resolved') update.resolved_at = null
  const { error } = await serviceClient().from('ops_issues').update(update).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/ops-issues')
  return { ok: true }
}
