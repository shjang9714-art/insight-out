import type { SupabaseClient } from '@supabase/supabase-js'
import { getOpsSettings } from '@/lib/ops/settings'

/** 명시 목록(ops_settings.brief_recipients)이 비면 super_admin 전원에게 보낸다. */
export async function getOpsRecipients(admin: SupabaseClient): Promise<string[]> {
  const configured = (await getOpsSettings()).brief_recipients
  if (configured.length) return configured
  const { data, error } = await admin.from('users').select('email').eq('role', 'super_admin').not('email', 'is', null)
  if (error) throw error
  return (data ?? []).map(row => row.email).filter(Boolean)
}
