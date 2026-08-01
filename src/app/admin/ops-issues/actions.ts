'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireAdminAction } from '@/lib/admin/require-admin-action'

function serviceClient() { return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!) }
type Status = 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'ignored'

export async function updateOpsIssue(id: string, patch: { status?: Status; assignee?: string | null; resolution_note?: string | null }) {
  const gate = await requireAdminAction()
  if (!gate.ok) return { ok: false, error: gate.error }
  const update: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() }
  if (patch.status === 'resolved') update.resolved_at = new Date().toISOString()
  if (patch.status && patch.status !== 'resolved') update.resolved_at = null
  const { error } = await serviceClient().from('ops_issues').update(update).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/ops-issues')
  return { ok: true }
}
