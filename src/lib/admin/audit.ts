import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

export async function startAudit(
  admin: SupabaseClient,
  params: {
    actorId: string
    actorEmail?: string | null
    action: string
    method?: string
    path?: string
    capability?: string
  },
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from('admin_audit_log')
      .insert({
        actor_id: params.actorId,
        actor_email: params.actorEmail ?? null,
        action: params.action,
        method: params.method ?? null,
        path: params.path ?? null,
        capability: params.capability ?? null,
      })
      .select('id')
      .single()
    if (error) {
      console.error('[admin-audit] 시작 기록 실패:', error)
      return null
    }
    return data?.id == null ? null : String(data.id)
  } catch (error) {
    console.error('[admin-audit] 시작 기록 실패:', error)
    return null
  }
}

export async function completeAudit(
  admin: SupabaseClient,
  auditId: string | null,
  params: {
    action?: string
    targetType?: string
    targetId?: string
    targetCount?: number
    payload?: Record<string, unknown>
    outcome: 'ok' | 'failed'
    error?: string
  },
): Promise<void> {
  if (!auditId) return
  try {
    const updates: Record<string, unknown> = {
      target_type: params.targetType ?? null,
      target_id: params.targetId ?? null,
      target_count: params.targetCount ?? null,
      payload: params.payload ?? null,
      outcome: params.outcome,
      error: params.error ?? null,
      completed_at: new Date().toISOString(),
    }
    if (params.action) updates.action = params.action
    const { error } = await admin
      .from('admin_audit_log')
      .update(updates)
      .eq('id', auditId)
    if (error) {
      console.error('[admin-audit] 완료 기록 실패:', error)
    }
  } catch (error) {
    console.error('[admin-audit] 완료 기록 실패:', error)
  }
}
