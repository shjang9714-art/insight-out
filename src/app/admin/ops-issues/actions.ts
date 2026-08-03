'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireAdminAction } from '@/lib/admin/require-admin-action'
import { completeAudit } from '@/lib/admin/audit'

function serviceClient() { return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!) }
type Status = 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'ignored'

export async function updateOpsIssue(id: string, patch: { status?: Status; assignee?: string | null; resolution_note?: string | null }) {
  const gate = await requireAdminAction({ action: 'ops_issue.update' })
  if (!gate.ok) return { ok: false, error: gate.error }
  const update: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() }
  if (patch.status === 'resolved') update.resolved_at = new Date().toISOString()
  if (patch.status && patch.status !== 'resolved') update.resolved_at = null
  const svc = serviceClient()
  const { data: previous } = await svc.from('ops_issues').select('status').eq('id', id).single()
  const { error } = await svc.from('ops_issues').update(update).eq('id', id)
  await completeAudit(svc, gate.auditId, { targetType: 'ops_issues', targetId: id, payload: { previousStatus: previous?.status ?? null, nextStatus: patch.status ?? previous?.status ?? null }, outcome: error ? 'failed' : 'ok', error: error?.message })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/ops-issues')
  return { ok: true }
}
