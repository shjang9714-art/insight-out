import { AuditLogTable, type AuditLogRow } from '@/components/admin/AuditLogTable'
import { createClient } from '@/lib/supabase/server'

/** 524 — audit-log/page.tsx 에서 이식. 데이터 로딩 로직 불변, 자체 헤더만 제거(허브가 대신 렌더). */
export default async function AuditLogPanel() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('admin_audit_log')
    .select('id, actor_email, action, target_type, target_id, target_count, outcome, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="space-y-4">
      <AuditLogTable rows={(data ?? []) as AuditLogRow[]} />
      <p className="text-sm text-muted-foreground">최근 100건만 표시</p>
    </div>
  )
}
