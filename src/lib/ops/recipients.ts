import type { SupabaseClient } from '@supabase/supabase-js'

export async function getOpsRecipients(admin: SupabaseClient): Promise<string[]> {
  const override = (process.env.OPS_BRIEF_RECIPIENTS ?? '').split(',').map(v => v.trim()).filter(Boolean)
  if (override.length) return override
  const { data, error } = await admin.from('users').select('email').eq('role', 'admin').not('email', 'is', null)
  if (error) throw error
  return (data ?? []).map(row => row.email).filter(Boolean)
}
