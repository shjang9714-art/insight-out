import type { Metadata } from 'next'
import { AuditLogTable, type AuditLogRow } from '@/components/admin/AuditLogTable'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: '관리자 감사 로그 | Insight Out',
  description: '관리자 쓰기 작업의 최근 감사 기록을 확인합니다.',
}

export default async function AuditLogPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('admin_audit_log')
    .select('id, actor_email, action, target_type, target_id, target_count, outcome, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">관리자 감사 로그</h1>
        <p className="mt-1 text-sm text-muted-foreground">관리자 쓰기 작업과 처리 결과를 확인합니다.</p>
      </div>
      <AuditLogTable rows={(data ?? []) as AuditLogRow[]} />
      <p className="text-sm text-muted-foreground">최근 100건만 표시</p>
    </div>
  )
}
