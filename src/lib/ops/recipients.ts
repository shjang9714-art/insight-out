import type { SupabaseClient } from '@supabase/supabase-js'
import { getOpsSettings } from '@/lib/ops/settings'

export async function getOpsRecipients(admin: SupabaseClient): Promise<string[]> {
  const configured = (await getOpsSettings()).brief_recipients
  if (configured.length) return configured
  const { data, error } = await admin.from('users').select('email').in('role', ['admin', 'super_admin']).not('email', 'is', null)
  if (error) throw error
  return (data ?? []).map(row => row.email).filter(Boolean)
}
